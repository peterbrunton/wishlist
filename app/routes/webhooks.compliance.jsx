import { authenticate } from "../shopify.server";
import db from "../db.server";

// Handles GDPR compliance webhooks: customers/data_request, customers/redact, shop/redact.
// Wishlists live in a customer metafield (Shopify removes it with the customer). The app keeps
// only a per-customer snapshot of product IDs for Klaviyo diffing, deleted on redact.
export const action = async ({ request }) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  if (topic === "SHOP_REDACT") {
    await db.session.deleteMany({ where: { shop } });
    await db.wishlistSnapshot.deleteMany({ where: { shop } });
  }

  if (topic === "CUSTOMERS_REDACT") {
    const customerId = payload?.customer?.id;
    if (customerId) {
      await db.wishlistSnapshot.deleteMany({
        where: { id: `${shop}:gid://shopify/Customer/${customerId}` },
      });
    }
  }

  return new Response();
};
