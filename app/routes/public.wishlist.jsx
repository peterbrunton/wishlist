import { json } from "@remix-run/node";
import { authenticate, unauthenticated } from "../shopify.server";
import {
  dedupeById,
  readWishlist,
  writeWishlist,
} from "../lib/wishlist.server";

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

  if (JSON.stringify(current) === JSON.stringify(updated)) {
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
