import { authenticate } from "../shopify.server";
import db from "../db.server";

// Handles GDPR compliance webhooks: customers/data_request, customers/redact, shop/redact.
// The app stores no customer data of its own — wishlists live in a customer metafield,
// which Shopify removes with the customer — so only shop/redact needs cleanup here.
export const action = async ({ request }) => {
  const { shop, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  if (topic === "SHOP_REDACT") {
    await db.session.deleteMany({ where: { shop } });
  }

  return new Response();
};
