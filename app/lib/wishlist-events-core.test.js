import { test } from "node:test";
import assert from "node:assert/strict";
import {
  METRIC_ADDED,
  METRIC_REMOVED,
  buildKlaviyoEvent,
  planWishlistEvents,
  readEventPayload,
} from "./wishlist-events-core.js";

const gid = (n) => `gid://shopify/Product/${n}`;
const t = (s) => new Date(`2026-11-05T10:00:${String(s).padStart(2, "0")}Z`);

test("readEventPayload pulls customer, email and ids", () => {
  const p = readEventPayload({
    data: {
      customer: {
        id: "gid://shopify/Customer/1",
        defaultEmailAddress: { emailAddress: "a@b.c" },
        metafield: { value: JSON.stringify([gid(1), gid(2)]) },
      },
    },
  });
  assert.deepEqual(p, { customerId: "gid://shopify/Customer/1", email: "a@b.c", ids: [gid(1), gid(2)] });
});

test("readEventPayload treats a removed metafield as an empty list", () => {
  const p = readEventPayload({ data: { customer: { id: "gid://shopify/Customer/1", metafield: null } } });
  assert.deepEqual(p.ids, []);
  assert.equal(p.email, null);
  assert.equal(readEventPayload({}), null);
});

test("first delivery for a customer: everything counts as added", () => {
  const r = planWishlistEvents({
    previousIds: null,
    currentIds: [gid(1)],
    triggeredAt: t(1),
    lastEventAt: null,
    deliveryId: "d1",
  });
  assert.deepEqual(r.added, [gid(1)]);
  assert.deepEqual(r.events, [{ metric: METRIC_ADDED, productId: gid(1), uniqueId: `d1:added:${gid(1)}` }]);
});

test("diff produces added and removed events", () => {
  const r = planWishlistEvents({
    previousIds: [gid(1), gid(2)],
    currentIds: [gid(3), gid(1)],
    triggeredAt: t(5),
    lastEventAt: t(1),
    deliveryId: "d2",
  });
  assert.deepEqual(r.added, [gid(3)]);
  assert.deepEqual(r.removed, [gid(2)]);
  assert.deepEqual(
    r.events.map((e) => e.metric),
    [METRIC_ADDED, METRIC_REMOVED],
  );
});

test("clearing the list removes everything", () => {
  const r = planWishlistEvents({
    previousIds: [gid(1), gid(2)],
    currentIds: [],
    triggeredAt: t(5),
    lastEventAt: t(1),
    deliveryId: "d3",
  });
  assert.deepEqual(r.removed, [gid(1), gid(2)]);
  assert.equal(r.events.every((e) => e.metric === METRIC_REMOVED), true);
});

test("out-of-order or repeated older deliveries are skipped", () => {
  const base = { previousIds: [gid(1)], currentIds: [], deliveryId: "d4" };
  assert.deepEqual(planWishlistEvents({ ...base, triggeredAt: t(1), lastEventAt: t(5) }), { skip: "stale" });
  assert.deepEqual(planWishlistEvents({ ...base, triggeredAt: t(5), lastEventAt: t(5) }), { skip: "stale" });
});

test("reorder-only change sends nothing", () => {
  const r = planWishlistEvents({
    previousIds: [gid(1), gid(2)],
    currentIds: [gid(2), gid(1)],
    triggeredAt: t(9),
    lastEventAt: t(1),
    deliveryId: "d5",
  });
  assert.deepEqual(r.events, []);
});

test("unique ids are stable for the same delivery (Shopify retries dedupe in Klaviyo)", () => {
  const input = { previousIds: [], currentIds: [gid(7)], triggeredAt: t(2), lastEventAt: null, deliveryId: "same" };
  assert.deepEqual(planWishlistEvents(input).events, planWishlistEvents(input).events);
});


test("buildKlaviyoEvent produces a Klaviyo JSON:API event", () => {
  const body = buildKlaviyoEvent({
    event: { metric: METRIC_ADDED, productId: gid(42), uniqueId: "d1:added:x" },
    email: "a@b.c",
    customerId: "gid://shopify/Customer/9",
    shop: "eu-spotlight.myshopify.com",
    time: t(3),
    wishlistCount: 2,
    product: {
      title: "Toothpaste",
      handle: "toothpaste",
      onlineStoreUrl: "https://eu.spotlightoralcare.com/products/toothpaste",
      featuredImage: { url: "https://cdn/x.jpg" },
      priceRange: { minVariantPrice: { amount: "12.50", currencyCode: "EUR" } },
    },
  });
  const a = body.data.attributes;
  assert.equal(body.data.type, "event");
  assert.equal(a.metric.data.attributes.name, "Added to Wishlist");
  assert.equal(a.profile.data.attributes.email, "a@b.c");
  assert.equal(a.unique_id, "d1:added:x");
  assert.equal(a.time, "2026-11-05T10:00:03.000Z");
  assert.equal(a.value, 12.5);
  assert.equal(a.value_currency, "EUR");
  assert.equal(a.properties.ProductID, "42");
  assert.equal(a.properties.ShopifyCustomerID, "9");
});

test("buildKlaviyoEvent copes with a deleted product and omits value on removals", () => {
  const body = buildKlaviyoEvent({
    event: { metric: METRIC_REMOVED, productId: gid(5), uniqueId: "u" },
    email: "a@b.c",
    customerId: "gid://shopify/Customer/9",
    shop: "s",
    time: t(1),
    wishlistCount: 0,
    product: null,
  });
  const a = body.data.attributes;
  assert.equal(a.properties.ProductName, null);
  assert.equal(a.properties.ProductID, "5");
  assert.equal("value" in a, false);
});
