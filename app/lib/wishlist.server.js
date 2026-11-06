// Wishlist storage on the customer: app-owned metafield $app:wishlist (list.product_reference).
// Writes use compare-and-set (compareDigest) so concurrent tabs/devices can't overwrite each other.
import {
  MAX_ITEMS,
  WishlistError,
  applyChange,
  parseRequestBody,
  parseStoredIds,
} from "./wishlist-core";

export const METAFIELD_NAMESPACE = "$app";
export const METAFIELD_KEY = "wishlist";
export const METAFIELD_TYPE = "list.product_reference";

// Pre-2026-10 storage, read once as a fallback so existing wishlists carry over on next write.
const LEGACY_NAMESPACE = "custom";
const LEGACY_KEY = "wishlist_products";

const MAX_WRITE_ATTEMPTS = 2;

async function graphql(admin, query, variables) {
  const response = await admin.graphql(query, { variables });
  const body = await response.json();
  if (!response.ok || body?.errors) {
    throw new WishlistError(502, `Admin API error: ${JSON.stringify(body?.errors ?? response.status)}`);
  }
  return body.data;
}

/**
 * Reads the customer's wishlist.
 * @returns {Promise<{ ids: string[], digest: string | null }>} `digest` is null when the metafield doesn't exist yet.
 */
export async function readWishlist(admin, customerId) {
  const data = await graphql(
    admin,
    `#graphql
      query WishlistRead($customerId: ID!, $namespace: String!, $key: String!, $legacyNamespace: String!, $legacyKey: String!) {
        customer(id: $customerId) {
          id
          wishlist: metafield(namespace: $namespace, key: $key) {
            value
            compareDigest
          }
          legacy: metafield(namespace: $legacyNamespace, key: $legacyKey) {
            value
          }
        }
      }`,
    {
      customerId,
      namespace: METAFIELD_NAMESPACE,
      key: METAFIELD_KEY,
      legacyNamespace: LEGACY_NAMESPACE,
      legacyKey: LEGACY_KEY,
    },
  );

  const customer = data?.customer;
  if (!customer) throw new WishlistError(404, "Customer not found");

  if (customer.wishlist) {
    return { ids: parseStoredIds(customer.wishlist.value), digest: customer.wishlist.compareDigest };
  }
  return { ids: parseStoredIds(customer.legacy?.value).slice(0, MAX_ITEMS), digest: null };
}

/** Keeps only IDs that are real, active products (drops deleted/draft/archived and non-products). */
export async function filterActiveProducts(admin, ids) {
  if (!ids.length) return [];
  const data = await graphql(
    admin,
    `#graphql
      query WishlistValidateProducts($ids: [ID!]!) {
        nodes(ids: $ids) {
          ... on Product {
            id
            status
          }
        }
      }`,
    { ids },
  );
  const active = new Set(
    (data?.nodes ?? []).filter((n) => n?.id && n.status === "ACTIVE").map((n) => n.id),
  );
  return ids.filter((id) => active.has(id));
}

/**
 * Persists the list with compare-and-set. Returns false on a digest conflict (someone else wrote first).
 * An empty list deletes the metafield, since list metafields can't be blank.
 */
async function writeWishlist(admin, customerId, ids, digest) {
  if (ids.length === 0) {
    const data = await graphql(
      admin,
      `#graphql
        mutation WishlistClear($metafields: [MetafieldIdentifierInput!]!) {
          metafieldsDelete(metafields: $metafields) {
            userErrors {
              field
              message
            }
          }
        }`,
      { metafields: [{ ownerId: customerId, namespace: METAFIELD_NAMESPACE, key: METAFIELD_KEY }] },
    );
    const errors = data?.metafieldsDelete?.userErrors ?? [];
    if (errors.length) throw new WishlistError(502, `Wishlist clear failed: ${JSON.stringify(errors)}`);
    return true;
  }

  const data = await graphql(
    admin,
    `#graphql
      mutation WishlistWrite($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields {
            id
          }
          userErrors {
            field
            message
            code
          }
        }
      }`,
    {
      metafields: [
        {
          ownerId: customerId,
          namespace: METAFIELD_NAMESPACE,
          key: METAFIELD_KEY,
          type: METAFIELD_TYPE,
          value: JSON.stringify(ids),
          // null = "must not exist yet"; a digest = "must still match what we read".
          compareDigest: digest,
        },
      ],
    },
  );

  const errors = data?.metafieldsSet?.userErrors ?? [];
  if (errors.some((e) => e.code === "STALE_OBJECT" || e.code === "INVALID_COMPARE_DIGEST")) {
    return false;
  }
  if (errors.length) throw new WishlistError(502, `Wishlist save failed: ${JSON.stringify(errors)}`);
  return true;
}

/**
 * Reads, applies a change, and writes back with compare-and-set, retrying once on conflict.
 * @returns {Promise<{ ids: string[], added: string[], removed: string[] }>}
 */
export async function updateWishlist(admin, customerId, action, ids) {
  // Only validate products we might add; removals of deleted products must still work.
  const candidates =
    action === "add" || action === "merge" ? await filterActiveProducts(admin, ids) : ids;

  for (let attempt = 1; attempt <= MAX_WRITE_ATTEMPTS; attempt++) {
    const { ids: current, digest } = await readWishlist(admin, customerId);
    const { next, added, removed, changed } = applyChange(current, action, candidates);

    // Nothing to change, unless this is the first write after a legacy fallback read.
    if (!changed && (digest !== null || current.length === 0)) {
      return { ids: next, added, removed };
    }

    if (await writeWishlist(admin, customerId, next, digest)) {
      return { ids: next, added, removed };
    }
  }

  throw new WishlistError(409, "Wishlist was changed elsewhere, please retry");
}

/**
 * Loads display data for the given product IDs, in wishlist order. Used by the current storefront
 * and account page until they read products themselves (Phases 3–4).
 */
export async function hydrateProducts(admin, ids) {
  if (!ids.length) return [];
  const data = await graphql(
    admin,
    `#graphql
      query WishlistProducts($ids: [ID!]!) {
        nodes(ids: $ids) {
          ... on Product {
            id
            handle
            title
            status
            onlineStoreUrl
            featuredMedia {
              preview {
                image {
                  url
                }
              }
            }
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

  const byId = new Map(
    (data?.nodes ?? []).filter((n) => n?.id && n.status === "ACTIVE").map((n) => [n.id, n]),
  );

  return ids
    .map((id) => byId.get(id))
    .filter(Boolean)
    .map((p) => ({
      id: p.id,
      handle: p.handle,
      title: p.title,
      onlineStoreUrl: p.onlineStoreUrl ?? `/products/${p.handle}`,
      featuredImage: p.featuredMedia?.preview?.image?.url
        ? { url: p.featuredMedia.preview.image.url }
        : null,
      priceRange: { minVariantPrice: p.priceRangeV2?.minVariantPrice ?? null },
    }));
}

/**
 * Shared GET/POST handler for the app proxy and customer account routes.
 * @returns {Promise<{ status: number, body: object }>}
 */
export async function handleWishlistApi({ admin, customerId, request }) {
  try {
    if (request.method === "GET" || request.method === "HEAD") {
      if (!customerId) return { status: 200, body: { ids: [], wishlist: [] } };
      const { ids } = await readWishlist(admin, customerId);
      return { status: 200, body: { ids, wishlist: await hydrateProducts(admin, ids) } };
    }

    if (request.method !== "POST") {
      return { status: 405, body: { error: "Method not allowed" } };
    }
    if (!customerId) {
      return { status: 401, body: { error: "Customer not logged in" } };
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      throw new WishlistError(400, "Invalid JSON payload");
    }

    const { action, ids } = parseRequestBody(payload);
    const result = await updateWishlist(admin, customerId, action, ids);

    return {
      status: 200,
      body: {
        ids: result.ids,
        added: result.added,
        removed: result.removed,
        wishlist: await hydrateProducts(admin, result.ids),
      },
    };
  } catch (err) {
    if (err instanceof WishlistError) {
      if (err.status >= 500) console.error("Wishlist error", err.message);
      return { status: err.status, body: { error: err.message } };
    }
    console.error("Wishlist unexpected error", err);
    return { status: 500, body: { error: "Wishlist request failed" } };
  }
}
