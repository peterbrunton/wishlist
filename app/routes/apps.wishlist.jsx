// Storefront app proxy: https://{shop}/apps/wishlist -> this route.
// Shopify signs proxy requests and appends logged_in_customer_id; we trust only that.
import { authenticate } from "../shopify.server";
import { handleWishlistApi } from "../lib/wishlist.server";

function loggedInCustomerGid(request) {
  const raw = new URL(request.url).searchParams.get("logged_in_customer_id");
  return raw && /^\d+$/.test(raw) ? `gid://shopify/Customer/${raw}` : null;
}

async function handle(request) {
  let admin;
  try {
    ({ admin } = await authenticate.public.appProxy(request));
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("Wishlist proxy auth error", err);
    return Response.json({ error: "App proxy authentication failed" }, { status: 401 });
  }
  if (!admin) {
    return Response.json({ error: "App not installed" }, { status: 401 });
  }

  const { status, body } = await handleWishlistApi({
    admin,
    customerId: loggedInCustomerGid(request),
    request,
  });
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export const loader = ({ request }) => handle(request);
export const action = ({ request }) => handle(request);
