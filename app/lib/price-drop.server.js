// Server side of wishlist price-drop alerts: price baselines, recipients, and the one-off Sync.
import db from "../db.server";
import { METAFIELD_KEY, METAFIELD_NAMESPACE } from "./wishlist.server";
import { parseStoredIds } from "./wishlist-core";
import { toCents } from "./price-drop-core";

async function graphql(admin, query, variables) {
  const response = await admin.graphql(query, { variables });
  const body = await response.json();
  if (!response.ok || body?.errors) {
    throw new Error(`Admin API error: ${JSON.stringify(body?.errors ?? response.status)}`);
  }
  return body.data;
}

const priceId = (shop, productId) => `${shop}:${productId}`;

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

export async function getBaseline(shop, productId) {
  return db.productPrice.findUnique({ where: { id: priceId(shop, productId) } });
}

export async function storeBaseline(shop, productId, { cents, currencyCode }, lastEventAt) {
  const id = priceId(shop, productId);
  await db.productPrice.upsert({
    where: { id },
    create: { id, shop, productId, cents, currencyCode, lastEventAt },
    update: { cents, currencyCode, lastEventAt },
  });
}

/**
 * Records the current lowest price for products that have no baseline yet (never overwrites one,
 * so a drop that happens before its delivery arrives isn't hidden). Returns how many were added.
 */
export async function seedBaselines(admin, shop, productIds) {
  const unique = [...new Set(productIds)];
  if (!unique.length) return 0;
  const existing = await db.productPrice.findMany({
    where: { id: { in: unique.map((p) => priceId(shop, p)) } },
    select: { productId: true },
  });
  const have = new Set(existing.map((r) => r.productId));
  const missing = unique.filter((p) => !have.has(p));
  let added = 0;
  for (const ids of chunk(missing, 100)) {
    const data = await graphql(
      admin,
      `#graphql
        query PriceBaselines($ids: [ID!]!) {
          nodes(ids: $ids) {
            ... on Product {
              id
              priceRangeV2 {
                minVariantPrice {
                  amount
                  currencyCode
                }
              }
            }
          }
        }`,
      { ids },
    );
    const now = new Date();
    for (const node of data?.nodes ?? []) {
      const price = node?.priceRangeV2?.minVariantPrice;
      const cents = toCents(price?.amount);
      if (!node?.id || cents === null || !price?.currencyCode) continue;
      const id = priceId(shop, node.id);
      await db.productPrice.upsert({
        where: { id },
        create: { id, shop, productId: node.id, cents, currencyCode: price.currencyCode, lastEventAt: now },
        update: {},
      });
      added++;
    }
  }
  return added;
}

/** Snapshots for the shop that might contain the product (string match first, exact check later). */
export async function snapshotsMentioning(shop, productId) {
  return db.wishlistSnapshot.findMany({
    where: { shop, productIds: { contains: `"${productId}"` } },
    select: { customerId: true, productIds: true },
  });
}

/** Map of customer GID → email for those that have one. */
export async function customerEmails(admin, customerIds) {
  const out = new Map();
  for (const ids of chunk([...new Set(customerIds)], 100)) {
    const data = await graphql(
      admin,
      `#graphql
        query PriceDropRecipients($ids: [ID!]!) {
          nodes(ids: $ids) {
            ... on Customer {
              id
              defaultEmailAddress {
                emailAddress
              }
            }
          }
        }`,
      { ids },
    );
    for (const node of data?.nodes ?? []) {
      const email = node?.defaultEmailAddress?.emailAddress;
      if (node?.id && email) out.set(node.id, email);
    }
  }
  return out;
}

/**
 * One-off backfill: reads every customer wishlist from the metafield definition, creates missing
 * snapshots (so those customers get price alerts; no Klaviyo events are sent) and seeds price
 * baselines for every saved product. Safe to run again.
 */
export async function syncWishlists(admin, shop) {
  let after = null;
  let customers = 0;
  let snapshotsCreated = 0;
  const productIds = new Set();

  do {
    const data = await graphql(
      admin,
      `#graphql
        query WishlistSync($namespace: String!, $key: String!, $after: String) {
          metafieldDefinitions(first: 1, ownerType: CUSTOMER, namespace: $namespace, key: $key) {
            nodes {
              metafields(first: 250, after: $after) {
                pageInfo {
                  hasNextPage
                  endCursor
                }
                nodes {
                  value
                  updatedAt
                  owner {
                    ... on Customer {
                      id
                    }
                  }
                }
              }
            }
          }
        }`,
      { namespace: METAFIELD_NAMESPACE, key: METAFIELD_KEY, after },
    );
    const page = data?.metafieldDefinitions?.nodes?.[0]?.metafields;
    if (!page) break;

    for (const mf of page.nodes ?? []) {
      const customerId = mf?.owner?.id;
      if (!customerId) continue;
      customers++;
      const ids = parseStoredIds(mf.value);
      ids.forEach((id) => productIds.add(id));
      const id = `${shop}:${customerId}`;
      const exists = await db.wishlistSnapshot.findUnique({ where: { id }, select: { id: true } });
      if (!exists) {
        await db.wishlistSnapshot.create({
          data: {
            id,
            shop,
            customerId,
            productIds: JSON.stringify(ids),
            lastEventAt: new Date(mf.updatedAt),
          },
        });
        snapshotsCreated++;
      }
    }
    after = page.pageInfo?.hasNextPage ? page.pageInfo.endCursor : null;
  } while (after);

  const baselinesAdded = await seedBaselines(admin, shop, [...productIds]);
  const tracked = await db.productPrice.count({ where: { shop } });
  return { customers, snapshotsCreated, products: productIds.size, baselinesAdded, tracked };
}

export async function trackedPriceCount(shop) {
  return db.productPrice.count({ where: { shop } });
}
