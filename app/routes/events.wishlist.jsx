// Events API delivery: Customer update on $app:wishlist (see [events] in shopify.app.toml).
// Fires for every write path (storefront proxy, customer account page), diffs against the last
// snapshot and sends Klaviyo "Added to Wishlist" / "Removed from Wishlist" events.
//
// Retries: if Klaviyo fails in a retryable way we return 500 without saving the snapshot, so
// Shopify redelivers; the same delivery id gives the same Klaviyo unique_id, so nothing doubles.
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { hydrateProducts } from "../lib/wishlist.server";
import { klaviyoEnabled, sendKlaviyoEvent } from "../lib/klaviyo.server";
import {
  buildKlaviyoEvent,
  planWishlistEvents,
  readEventPayload,
} from "../lib/wishlist-events-core";

function header(request, name) {
  return request.headers.get(name) ?? request.headers.get(`x-${name}`);
}

export const action = async ({ request }) => {
  const { shop, payload, admin, webhookId } = await authenticate.webhook(request);

  const parsed = readEventPayload(payload);
  if (!parsed) return new Response();

  const deliveryId = header(request, "shopify-webhook-id") ?? webhookId ?? "unknown";
  const triggeredRaw = header(request, "shopify-triggered-at");
  const triggeredAt = triggeredRaw ? new Date(triggeredRaw) : new Date();

  const snapshotId = `${shop}:${parsed.customerId}`;
  const snapshot = await db.wishlistSnapshot.findUnique({ where: { id: snapshotId } });

  const plan = planWishlistEvents({
    previousIds: snapshot ? JSON.parse(snapshot.productIds) : null,
    currentIds: parsed.ids,
    triggeredAt,
    lastEventAt: snapshot?.lastEventAt ?? null,
    deliveryId,
  });
  if ("skip" in plan) return new Response();

  if (plan.events.length && !parsed.email) {
    console.log(`Wishlist events: customer ${parsed.customerId} has no email, skipping Klaviyo`);
  } else if (plan.events.length && !klaviyoEnabled()) {
    console.log(`Wishlist events: KLAVIYO_PRIVATE_KEY not set, skipping ${plan.events.length} event(s)`);
  } else if (plan.events.length) {
    const productIds = [...new Set(plan.events.map((e) => e.productId))];
    const products = admin ? await hydrateProducts(admin, productIds).catch(() => []) : [];
    const byId = new Map(products.map((p) => [p.id, p]));

    const results = await Promise.all(
      plan.events.map((event) =>
        sendKlaviyoEvent(
          buildKlaviyoEvent({
            event,
            email: parsed.email,
            customerId: parsed.customerId,
            shop,
            time: triggeredAt,
            wishlistCount: parsed.ids.length,
            product: byId.get(event.productId) ?? null,
          }),
        ),
      ),
    );

    const failures = results.filter((r) => !r.ok);
    for (const f of failures) {
      console.error(`Klaviyo event failed (status ${f.status}, retryable ${f.retryable}): ${f.detail}`);
    }
    if (failures.some((f) => f.retryable)) {
      return new Response("Klaviyo unavailable, retry", { status: 500 });
    }
  }

  await db.wishlistSnapshot.upsert({
    where: { id: snapshotId },
    create: {
      id: snapshotId,
      shop,
      customerId: parsed.customerId,
      productIds: JSON.stringify(parsed.ids),
      lastEventAt: triggeredAt,
    },
    update: { productIds: JSON.stringify(parsed.ids), lastEventAt: triggeredAt },
  });

  return new Response();
};
