// Server side of wishlist price-drop alerts: price baselines, recipients, and the one-off Sync.
import db from "../db.server";
import { METAFIELD_KEY, METAFIELD_NAMESPACE } from "./wishlist.server";
import { parseStoredIds } from "./wishlist-core";
import { batchWindowMs, buildPriceDropBatchEvent, dueBatches, pendingDropId, toCents } from "./price-drop-core";
import { klaviyoEnabled, sendKlaviyoEvent } from "./klaviyo.server";

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

// ---- Batching: queue drops per customer, send one event per customer after the window ----

/** Queues one drop per recipient (idempotent: same drop for the same customer upserts one row). */
export async function queuePriceDrops({ shop, productId, drop, currencyCode, product, recipients }) {
  const productJson = JSON.stringify(product);
  for (const { customerId, email } of recipients) {
    const id = pendingDropId(shop, customerId, productId, drop.key);
    await db.pendingPriceDrop.upsert({
      where: { id },
      create: {
        id,
        shop,
        customerId,
        email,
        productId,
        fromCents: drop.fromCents,
        toCents: drop.toCents,
        currencyCode,
        product: productJson,
      },
      update: {},
    });
  }
}

let flushing = false;

/**
 * Sends every batch whose window has passed. A product the customer removed in the meantime is
 * dropped from the batch. Retryable Klaviyo failures stay queued for the next tick.
 */
export async function flushPriceDrops(now = new Date()) {
  if (flushing) return { sent: 0 };
  flushing = true;
  let sent = 0;
  try {
    const rows = await db.pendingPriceDrop.findMany({ where: { sentAt: null } });
    if (!rows.length) return { sent: 0 };
    for (const batch of dueBatches(rows, now, batchWindowMs())) {
      const snapshot = await db.wishlistSnapshot.findUnique({
        where: { id: `${batch.shop}:${batch.customerId}` },
        select: { productIds: true },
      });
      let saved = [];
      try {
        saved = JSON.parse(snapshot?.productIds ?? "[]");
      } catch {
        saved = [];
      }
      batch.items = batch.items.filter((it) => saved.includes(it.productId));

      const mark = (data) =>
        db.pendingPriceDrop.updateMany({ where: { id: { in: batch.rowIds } }, data });

      if (!batch.items.length) {
        await mark({ sentAt: now, error: "no longer saved" });
        continue;
      }
      if (!klaviyoEnabled()) {
        console.log(`Price drop batch: ${batch.customerId} ${batch.items.length} item(s), KLAVIYO_PRIVATE_KEY not set, skipping`);
        await mark({ sentAt: now, error: "klaviyo disabled" });
        continue;
      }
      const result = await sendKlaviyoEvent(buildPriceDropBatchEvent({ batch, time: now }));
      if (result.ok) {
        console.log(`Price drop batch: sent ${batch.items.length} item(s) to ${batch.customerId}`);
        await mark({ sentAt: now });
        sent++;
      } else if (result.retryable) {
        console.error(`Price drop batch: Klaviyo ${result.status}, will retry: ${result.detail}`);
      } else {
        console.error(`Price drop batch: Klaviyo ${result.status}, giving up: ${result.detail}`);
        await mark({ sentAt: now, error: `klaviyo ${result.status}` });
      }
    }
    // Housekeeping: forget sent rows after 30 days.
    await db.pendingPriceDrop.deleteMany({
      where: { sentAt: { lt: new Date(now.getTime() - 30 * 24 * 3600_000) } },
    });
  } catch (err) {
    console.error("Price drop flush failed", err);
  } finally {
    flushing = false;
  }
  return { sent };
}

/** Starts the once-a-minute flusher (one per process). */
export function startPriceDropFlusher(intervalMs = 60_000) {
  if (globalThis.__priceDropFlusher) return;
  globalThis.__priceDropFlusher = setInterval(() => {
    flushPriceDrops().catch(() => {});
  }, intervalMs);
  globalThis.__priceDropFlusher.unref?.();
}
