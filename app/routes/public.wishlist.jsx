import { json } from "@remix-run/node";
import { authenticate, unauthenticated } from "../shopify.server";

const METAFIELD_NAMESPACE = "wishlist";
const METAFIELD_KEY = "customer_products";

function parseWishlist(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
}

function dedupeById(items = []) {
  const map = new Map();
  for (const item of items) {
    if (item?.id) {
      map.set(item.id, item);
    }
  }
  return Array.from(map.values());
}

async function readWishlist(admin, customerId) {
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

async function writeWishlist(admin, customerId, wishlist) {
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

export const loader = async ({ request }) => {
  const { sessionToken, cors } = await authenticate.public.customerAccount(
    request
  );

  const customerId = sessionToken.sub;
  if (!customerId) {
    return cors(json({ error: "Customer not logged in" }, { status: 401 }));
  }

  const shop = sessionToken.dest?.replace(/^https?:\/\//, "");
  if (!shop) {
    return cors(json({ error: "Missing shop context" }, { status: 400 }));
  }
  const { admin } = await unauthenticated.admin(shop);

  try {
    const wishlist = await readWishlist(admin, customerId);
    return cors(json({ wishlist }));
  } catch (err) {
    console.error("Customer account wishlist fetch error", err);
    return cors(json({ error: "Wishlist fetch failed" }, { status: 502 }));
  }
};

export const action = async ({ request }) => {
  const { sessionToken, cors } = await authenticate.public.customerAccount(
    request
  );

  if (request.method === "OPTIONS") {
    return cors(new Response(null, { status: 204 }));
  }

  const customerId = sessionToken.sub;
  if (!customerId) {
    return cors(json({ error: "Customer not logged in" }, { status: 401 }));
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return cors(json({ error: "Invalid JSON payload" }, { status: 400 }));
  }

  const shop = sessionToken.dest?.replace(/^https?:\/\//, "");
  if (!shop) {
    return cors(json({ error: "Missing shop context" }, { status: 400 }));
  }
  const { admin } = await unauthenticated.admin(shop);

  let current = [];
  try {
    current = await readWishlist(admin, customerId);
  } catch (err) {
    console.error("Customer account wishlist fetch error", err);
    return cors(json({ error: "Wishlist fetch failed" }, { status: 502 }));
  }
  const actionType = payload?.action;
  const product = payload?.product;
  const incoming = payload?.wishlist;
  let updated = current;

  if (actionType === "add" && product?.id) {
    updated = dedupeById([...current, product]);
  } else if (actionType === "remove" && product?.id) {
    updated = current.filter((item) => item?.id !== product.id);
  } else if (actionType === "sync" && Array.isArray(incoming)) {
    updated = dedupeById([...current, ...incoming]);
  } else if (actionType === "replace" && Array.isArray(incoming)) {
    updated = dedupeById(incoming);
  } else {
    return cors(json({ error: "Unsupported action" }, { status: 400 }));
  }

  const currentSerialized = JSON.stringify(current);
  const updatedSerialized = JSON.stringify(updated);

  if (currentSerialized === updatedSerialized) {
    return cors(json({ wishlist: updated }));
  }

  try {
    await writeWishlist(admin, customerId, updated);
  } catch (err) {
    console.error("Customer account wishlist save error", err);
    return cors(json({ error: "Wishlist save failed" }, { status: 502 }));
  }

  return cors(json({ wishlist: updated }));
};
