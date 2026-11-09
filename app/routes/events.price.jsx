// Events API delivery: a variant price changed on an active product (see [events] in shopify.app.toml).
// Compares the product's new lowest list price with the stored baseline and, on a drop of at least
// PRICE_DROP_MIN_PERCENT (default 5 %), sends a Klaviyo "Wishlist Price Drop" event to every
// customer who has the product saved.
//
// Retries: if Klaviyo fails in a retryable way we return 500 without moving the baseline, so
// Shopify redelivers. Each alert's unique_id is derived from the baseline and the customer, so
// retries and the one-delivery-per-variant fan-out can't alert anyone twice.
import { authenticate } from "../shopify.server";
import { klaviyoEnabled, sendKlaviyoEvent } from "../lib/klaviyo.server";
import {
  buildPriceDropEvent,
  customersWithProduct,
  minDropPercent,
  planPriceChange,
  readPricePayload,
} from "../lib/price-drop-core";
import {
  customerEmails,
  getBaseline,
  snapshotsMentioning,
  storeBaseline,
} from "../lib/price-drop.server";

const CONCURRENCY = 8;

function header(request, name) {
  return request.headers.get(name) ?? request.headers.get(`x-${name}`);
}

async function mapLimit(items, limit, fn) {
  const results = [];
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
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
    } else if (!klaviyoEnabled()) {
      console.log(`Price drop: ${label}, KLAVIYO_PRIVATE_KEY not set, skipping ${customerIds.length} alert(s)`);
    } else {
      const emails = admin ? await customerEmails(admin, customerIds) : new Map();
      const recipients = customerIds.filter((id) => emails.has(id));
      console.log(`Price drop: ${label}, alerting ${recipients.length} of ${customerIds.length} customer(s)`);

      const results = await mapLimit(recipients, CONCURRENCY, (customerId) =>
        sendKlaviyoEvent(
          buildPriceDropEvent({
            drop: plan.drop,
            product: parsed.product,
            currencyCode: parsed.currencyCode,
            email: emails.get(customerId),
            customerId,
            shop,
            time: triggeredAt,
          }),
        ),
      );
      const failures = results.filter((r) => !r.ok);
      for (const f of failures) {
        console.error(`Klaviyo price-drop event failed (status ${f.status}, retryable ${f.retryable}): ${f.detail}`);
      }
      if (failures.some((f) => f.retryable)) {
        return new Response("Klaviyo unavailable, retry", { status: 500 });
      }
    }
  }

  await storeBaseline(shop, parsed.productId, { cents: parsed.cents, currencyCode: parsed.currencyCode }, triggeredAt);
  return new Response();
};
