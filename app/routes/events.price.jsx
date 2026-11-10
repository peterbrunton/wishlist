// Events API delivery: a variant price changed on an active product (see [events] in shopify.app.toml).
// Compares the product's new lowest list price with the stored baseline and, on a drop of at least
// PRICE_DROP_MIN_PERCENT (default 5 %), queues the drop for every customer who has the product saved.
// The flusher (lib/price-drop.server.js) then sends ONE Klaviyo "Wishlist Price Drop" event per
// customer listing every saved item that dropped within PRICE_DROP_BATCH_MINUTES (default 10).
//
// Idempotent: queued rows are keyed by customer + product + drop key (derived from the baseline),
// so per-variant deliveries and Shopify retries upsert the same row.
import { authenticate } from "../shopify.server";
import { customersWithProduct, minDropPercent, planPriceChange, readPricePayload } from "../lib/price-drop-core";
import {
  customerEmails,
  getBaseline,
  queuePriceDrops,
  snapshotsMentioning,
  storeBaseline,
} from "../lib/price-drop.server";

function header(request, name) {
  return request.headers.get(name) ?? request.headers.get(`x-${name}`);
}

export const action = async ({ request }) => {
  const { shop, payload, admin } = await authenticate.webhook(request);

  const parsed = readPricePayload(payload);
  if (!parsed || (parsed.status && parsed.status !== "ACTIVE")) return new Response();

  const triggeredRaw = header(request, "shopify-triggered-at");
  const triggeredAt = triggeredRaw ? new Date(triggeredRaw) : new Date();

  const baseline = await getBaseline(shop, parsed.productId);
  const plan = planPriceChange({
    baseline,
    current: { cents: parsed.cents, currencyCode: parsed.currencyCode },
    triggeredAt,
    minPercent: minDropPercent(),
  });
  if ("skip" in plan) return new Response();

  if (plan.drop) {
    const snapshots = await snapshotsMentioning(shop, parsed.productId);
    const customerIds = customersWithProduct(snapshots, parsed.productId);
    const label = `${parsed.product.title ?? parsed.productId} ${plan.drop.fromCents / 100} -> ${plan.drop.toCents / 100} ${parsed.currencyCode}`;

    if (!customerIds.length) {
      console.log(`Price drop: ${label}, nobody has it saved`);
    } else {
      // Email lookup failing is worth a retry (Shopify redelivers on 5xx; queueing is idempotent).
      const emails = admin ? await customerEmails(admin, customerIds) : new Map();
      const recipients = customerIds
        .filter((id) => emails.has(id))
        .map((customerId) => ({ customerId, email: emails.get(customerId) }));
      await queuePriceDrops({
        shop,
        productId: parsed.productId,
        drop: plan.drop,
        currencyCode: parsed.currencyCode,
        product: parsed.product,
        recipients,
      });
      console.log(`Price drop: ${label}, queued for ${recipients.length} of ${customerIds.length} customer(s)`);
    }
  }

  await storeBaseline(shop, parsed.productId, { cents: parsed.cents, currencyCode: parsed.currencyCode }, triggeredAt);
  return new Response();
};
