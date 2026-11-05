const METAFIELD_NAMESPACE = "custom";
const METAFIELD_KEY = "wishlist_products";

export function parseWishlist(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
}

export function dedupeById(items = []) {
  const map = new Map();
  for (const item of items) {
    if (item?.id) {
      map.set(item.id, item);
    }
  }
  return Array.from(map.values());
}

export async function readWishlist(admin, customerId) {
  const query = `#graphql
    query GetCustomerWishlist($customerId: ID!) {
      customer(id: $customerId) {
        id
        metafield(namespace: "${METAFIELD_NAMESPACE}", key: "${METAFIELD_KEY}") {
          value
        }
      }
    }
  `;

  const response = await admin.graphql(query, { variables: { customerId } });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(JSON.stringify(data?.errors ?? "Wishlist fetch failed"));
  }

  const rawValue = data?.data?.customer?.metafield?.value;
  return parseWishlist(rawValue);
}

export async function writeWishlist(admin, customerId, wishlist) {
  const mutation = `#graphql
    mutation SaveCustomerWishlist($customerId: ID!, $wishlist: String!) {
      customerUpdate(input: {
        id: $customerId
        metafields: [
          {
            namespace: "${METAFIELD_NAMESPACE}"
            key: "${METAFIELD_KEY}"
            type: "json"
            value: $wishlist
          }
        ]
      }) {
        customer {
          id
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const response = await admin.graphql(mutation, {
    variables: {
      customerId,
      wishlist: JSON.stringify(wishlist ?? []),
    },
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(JSON.stringify(data?.errors ?? "Wishlist save failed"));
  }

  const mutationResult = data?.data?.customerUpdate;

  if (!mutationResult) {
    throw new Error("Wishlist save failed");
  }

  if (mutationResult.userErrors?.length) {
    throw new Error(JSON.stringify(mutationResult.userErrors));
  }
}
