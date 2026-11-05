// Wishlist data access for customer account extensions.
// Reads/writes the app-owned customer metafield $app:wishlist through the Customer Account API
// and loads live product data (market currency + language) through the Storefront API.

const CUSTOMER_API_URL = "shopify://customer-account/api/2026-10/graphql.json";
const NAMESPACE = "$app";
const KEY = "wishlist";
const TYPE = "list.product_reference";
const PRODUCT_GID = /^gid:\/\/shopify\/Product\/\d+$/;

async function customerApi(query, variables) {
  const response = await fetch(CUSTOMER_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body || body.errors) {
    throw new Error(body?.errors?.[0]?.message || `Customer Account API ${response.status}`);
  }
  return body.data;
}

function parseIds(value) {
  if (!value) return [];
  try {
    const list = JSON.parse(value);
    return Array.isArray(list) ? list.filter((id) => PRODUCT_GID.test(id)) : [];
  } catch {
    return [];
  }
}

/** @returns {Promise<{ customerId: string, ids: string[], digest: string | null }>} */
export async function readWishlist() {
  const data = await customerApi(
    `query WishlistRead($namespace: String!, $key: String!) {
      customer {
        id
        metafield(namespace: $namespace, key: $key) {
          value
          compareDigest
        }
      }
    }`,
    { namespace: NAMESPACE, key: KEY },
  );
  return {
    customerId: data.customer.id,
    ids: parseIds(data.customer.metafield?.value),
    digest: data.customer.metafield?.compareDigest ?? null,
  };
}

/** Writes with compare-and-set. Returns false if someone else changed the list first. */
async function writeWishlist(customerId, ids, digest) {
  if (ids.length === 0) {
    const data = await customerApi(
      `mutation WishlistClear($metafields: [MetafieldIdentifierInput!]!) {
        metafieldsDelete(metafields: $metafields) {
          userErrors {
            field
            message
          }
        }
      }`,
      { metafields: [{ ownerId: customerId, namespace: NAMESPACE, key: KEY }] },
    );
    const errors = data.metafieldsDelete?.userErrors ?? [];
    if (errors.length) throw new Error(errors[0].message);
    return true;
  }

  const data = await customerApi(
    `mutation WishlistWrite($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields {
          compareDigest
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
          namespace: NAMESPACE,
          key: KEY,
          type: TYPE,
          value: JSON.stringify(ids),
          compareDigest: digest,
        },
      ],
    },
  );
  const errors = data.metafieldsSet?.userErrors ?? [];
  if (errors.some((e) => e.code === "STALE_OBJECT" || e.code === "INVALID_COMPARE_DIGEST")) {
    return false;
  }
  if (errors.length) throw new Error(errors[0].message);
  return true;
}

/** Removes one product, re-reading and retrying once if the list changed elsewhere. */
export async function removeFromWishlist(productId) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const { customerId, ids, digest } = await readWishlist();
    const next = ids.filter((id) => id !== productId);
    if (next.length === ids.length) return next;
    if (await writeWishlist(customerId, next, digest)) return next;
  }
  throw new Error("Wishlist changed elsewhere");
}

/** Loads products in wishlist order, priced for the customer's country and language. */
export async function loadProducts(ids) {
  if (!ids.length) return [];
  const country = shopify.localization?.country?.value?.isoCode;
  const language = shopify.localization?.language?.value?.isoCode?.split("-")[0]?.toUpperCase();

  const { data, errors } = await shopify.query(
    `query WishlistProducts($ids: [ID!]!, $country: CountryCode, $language: LanguageCode)
      @inContext(country: $country, language: $language) {
      nodes(ids: $ids) {
        ... on Product {
          id
          title
          onlineStoreUrl
          availableForSale
          featuredImage {
            url
            altText
          }
          priceRange {
            minVariantPrice {
              amount
              currencyCode
            }
          }
          variants(first: 2) {
            nodes {
              id
              availableForSale
            }
          }
        }
      }
    }`,
    { variables: { ids, country, language } },
  );
  if (errors?.length && !data) throw new Error(errors[0].message);

  const byId = new Map((data?.nodes ?? []).filter((n) => n?.id).map((n) => [n.id, n]));
  return ids.map((id) => byId.get(id)).filter(Boolean);
}

/**
 * Cart link for single-variant products that are in stock, otherwise null
 * (multi-variant products need a choice on the product page).
 */
export function addToCartUrl(product) {
  const variants = product.variants?.nodes ?? [];
  if (!product.onlineStoreUrl || variants.length !== 1 || !variants[0].availableForSale) {
    return null;
  }
  const variantId = variants[0].id.split("/").pop();
  return `${new URL(product.onlineStoreUrl).origin}/cart/add?id=${variantId}&quantity=1`;
}
