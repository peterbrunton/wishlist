// Customer account UI extension backend. The extension sends its session token as a Bearer header.
// Phase 4 moves the account page to the Customer Account API and retires this route.
import { authenticate, unauthenticated } from "../shopify.server";
import { handleWishlistApi } from "../lib/wishlist.server";

async function handle(request) {
  const { sessionToken, cors } = await authenticate.public.customerAccount(request);

  if (request.method === "OPTIONS") {
    return cors(new Response(null, { status: 204 }));
  }

  const shop = sessionToken.dest?.replace(/^https?:\/\//, "");
  if (!shop) {
    return cors(Response.json({ error: "Missing shop context" }, { status: 400 }));
  }
  const { admin } = await unauthenticated.admin(shop);

  const { status, body } = await handleWishlistApi({
    admin,
    customerId: sessionToken.sub ?? null,
    request,
  });
  return cors(Response.json(body, { status }));
}

export const loader = ({ request }) => handle(request);
export const action = ({ request }) => handle(request);
