// Pure logic for turning Events API deliveries into Klaviyo events. Unit-tested.
import { parseStoredIds } from "./wishlist-core.js";

export const METRIC_ADDED = "Added to Wishlist";
export const METRIC_REMOVED = "Removed from Wishlist";

/** Extracts the customer ID, email and current product IDs from an Events API payload. */
export function readEventPayload(payload) {
  const customer = payload?.data?.customer;
  if (!customer?.id) return null;
  return {
    customerId: customer.id,
    email: customer.defaultEmailAddress?.emailAddress ?? null,
    // A removed metafield (empty wishlist) arrives as null.
    ids: parseStoredIds(customer.metafield?.value ?? null),
  };
}

/**
 * Decides what to send for one delivery.
 *
 * @param {object} input
 * @param {string[] | null} input.previousIds  last snapshot, or null if we've never seen this customer
 * @param {string[]} input.currentIds          list in this delivery
 * @param {Date} input.triggeredAt             shopify-triggered-at of this delivery
 * @param {Date | null} input.lastEventAt      triggered-at of the last applied delivery
 * @param {string} input.deliveryId            shopify-webhook-id (stable across Shopify retries)
 * @returns {{ skip: string } | { added: string[], removed: string[], events: Array<{ metric: string, productId: string, uniqueId: string }> }}
 */
export function planWishlistEvents({ previousIds, currentIds, triggeredAt, lastEventAt, deliveryId }) {
  if (lastEventAt && triggeredAt.getTime() <= lastEventAt.getTime()) {
    return { skip: "stale" };
  }

  // First time we see a customer, treat everything as newly added: wishlists only
  // exist once someone adds to them, so this is their first add (or a guest merge).
  const before = new Set(previousIds ?? []);
  const after = new Set(currentIds);
  const added = currentIds.filter((id) => !before.has(id));
  const removed = (previousIds ?? []).filter((id) => !after.has(id));

  const events = [
    ...added.map((productId) => ({
      metric: METRIC_ADDED,
      productId,
      uniqueId: `${deliveryId}:added:${productId}`,
    })),
    ...removed.map((productId) => ({
      metric: METRIC_REMOVED,
      productId,
      uniqueId: `${deliveryId}:removed:${productId}`,
    })),
  ];

  return { added, removed, events };
}

/**
 * Builds a Klaviyo "Create Event" JSON:API body (revision 2026-10-15).
 * The profile is identified by email only, so it merges with the profile the
 * Klaviyo–Shopify integration already created; the Shopify customer ID rides along as a property.
 *
 * @param {object} input
 * @param {{ metric: string, productId: string, uniqueId: string }} input.event
 * @param {string} input.email
 * @param {string} input.customerId
 * @param {string} input.shop
 * @param {Date} input.time
 * @param {number} input.wishlistCount
 * @param {null | { title: string, handle: string, onlineStoreUrl: string, featuredImage: { url: string } | null,
 *   priceRange: { minVariantPrice: { amount: string, currencyCode: string } | null } }} input.product
 */
export function buildKlaviyoEvent({ event, email, customerId, shop, time, wishlistCount, product }) {
  const price = product?.priceRange?.minVariantPrice ?? null;
  const amount = price ? Number(price.amount) : null;
  const properties = {
    ProductID: event.productId.split("/").pop(),
    ProductGID: event.productId,
    ProductName: product?.title ?? null,
    ProductHandle: product?.handle ?? null,
    URL: product?.onlineStoreUrl ?? null,
    ImageURL: product?.featuredImage?.url ?? null,
    Price: Number.isFinite(amount) ? amount : null,
    Currency: price?.currencyCode ?? null,
    WishlistCount: wishlistCount,
    ShopifyCustomerID: customerId.split("/").pop(),
    Shop: shop,
    Source: "Wishlist app",
  };

  const attributes = {
    properties,
    time: time.toISOString(),
    unique_id: event.uniqueId,
    metric: { data: { type: "metric", attributes: { name: event.metric } } },
    profile: { data: { type: "profile", attributes: { email } } },
  };
  if (event.metric === METRIC_ADDED && Number.isFinite(amount)) {
    attributes.value = amount;
    attributes.value_currency = price.currencyCode;
  }

  return { data: { type: "event", attributes } };
}
