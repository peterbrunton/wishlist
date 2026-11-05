import { json } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import {
  dedupeById,
  readWishlist,
  writeWishlist,
} from "~/lib/wishlist.server";

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

  try {
    const wishlist = await readWishlist(admin, customerId);
    return json({ wishlist });
  } catch (err) {
    console.error("Wishlist proxy fetch error", err);
    return json({ error: "Wishlist fetch failed" }, { status: 502 });
  }
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

  let current = [];
  try {
    current = await readWishlist(admin, customerId);
  } catch (err) {
    console.error("Wishlist proxy fetch error", err);
    return json({ error: "Wishlist fetch failed" }, { status: 502 });
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
    return json({ error: "Unsupported action" }, { status: 400 });
  }

  if (JSON.stringify(current) === JSON.stringify(updated)) {
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
