import { json } from "@remix-run/node";
import { authenticate } from "~/shopify.server";

const METAFIELD_NAMESPACE = "wishlist";
const METAFIELD_KEY = "customer_products";

function extractCustomerGid(url, headers) {
  // Trust only Shopify-provided logged_in_customer_id (app proxy adds this)
  const rawId =
    url.searchParams.get("logged_in_customer_id") ||
    headers.get("x-shopify-logged-in-customer-id");

  if (!rawId) {
    return null;
  }

  if (rawId.startsWith("gid://")) {
    return rawId;
  }

  return /^\d+$/.test(rawId) ? `gid://shopify/Customer/${rawId}` : null;
}

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

  try {
    const response = await admin.graphql(query, { variables: { customerId } });
    const data = await response.json();

    if (!response.ok) {
      console.error("Wishlist proxy fetch failed", data?.errors);
      return [];
    }

    const rawValue = data?.data?.customer?.metafield?.value;
    return parseWishlist(rawValue);
  } catch (err) {
    console.error("Wishlist proxy read error", err);
    return [];
  }
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
  let admin;
  try {
    ({ admin } = await authenticate.public.appProxy(request));
  } catch (err) {
    console.error("Wishlist proxy auth error", err);
    return json({ error: "App proxy authentication failed" }, { status: 401 });
  }
  const url = new URL(request.url);
  const customerId = extractCustomerGid(url, request.headers);

  if (!customerId) {
    return json({ wishlist: [] });
  }

  const wishlist = await readWishlist(admin, customerId);
  return json({ wishlist });
};

export const action = async ({ request }) => {
  let admin;
  try {
    ({ admin } = await authenticate.public.appProxy(request));
  } catch (err) {
    console.error("Wishlist proxy auth error", err);
    return json({ error: "App proxy authentication failed" }, { status: 401 });
  }
  const url = new URL(request.url);
  const customerId = extractCustomerGid(url, request.headers);

  if (!customerId) {
    return json({ error: "Customer not logged in" }, { status: 401 });
  }

  let payload;
  try {
    payload = await request.json();
  } catch (err) {
    return json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const current = await readWishlist(admin, customerId);
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
    return json({ error: "Unsupported action" }, { status: 400 });
  }

  const currentSerialized = JSON.stringify(current);
  const updatedSerialized = JSON.stringify(updated);

  if (currentSerialized === updatedSerialized) {
    return json({ wishlist: updated });
  }

  try {
    await writeWishlist(admin, customerId, updated);
  } catch (err) {
    console.error("Wishlist proxy save error", err);
    return json({ error: "Wishlist save failed" }, { status: 502 });
  }

  return json({ wishlist: updated });
};
