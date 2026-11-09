import { test } from "node:test";
import assert from "node:assert/strict";
import {
  METRIC_PRICE_DROP,
  buildPriceDropEvent,
  customersWithProduct,
  minDropPercent,
  planPriceChange,
  readPricePayload,
  toCents,
} from "./price-drop-core.js";

const gid = (n) => `gid://shopify/Product/${n}`;
const t = (s) => new Date(`2026-11-25T10:00:${String(s).padStart(2, "0")}Z`);
const base = (cents, s = 0) => ({ cents, currencyCode: "EUR", lastEventAt: t(s), updatedAt: t(s) });

test("toCents handles money strings", () => {
  assert.equal(toCents("26.99"), 2699);
  assert.equal(toCents("49.0"), 4900);
  assert.equal(toCents("0.1"), 10);
  assert.equal(toCents("x"), null);
  assert.equal(toCents(undefined), null);
});

test("minDropPercent defaults to 5 and reads the env", () => {
  assert.equal(minDropPercent({}), 5);
  assert.equal(minDropPercent({ PRICE_DROP_MIN_PERCENT: "10" }), 10);
  assert.equal(minDropPercent({ PRICE_DROP_MIN_PERCENT: "0" }), 5);
});

test("readPricePayload pulls product and lowest price", () => {
  const p = readPricePayload({
    data: {
      product: {
        id: gid(1),
        status: "ACTIVE",
        title: "Strips",
        handle: "strips",
        onlineStoreUrl: "https://x/products/strips",
        featuredMedia: { preview: { image: { url: "https://img" } } },
        priceRangeV2: { minVariantPrice: { amount: "17.54", currencyCode: "EUR" } },
      },
    },
  });
  assert.equal(p.cents, 1754);
  assert.equal(p.currencyCode, "EUR");
  assert.equal(p.product.imageUrl, "https://img");
  assert.equal(readPricePayload({ data: { product: { id: gid(1) } } }), null);
});

test("no baseline: store, no alert", () => {
  const r = planPriceChange({ baseline: null, current: { cents: 1000, currencyCode: "EUR" }, triggeredAt: t(1), minPercent: 5 });
  assert.deepEqual(r, { store: true, drop: null });
});

test("stale or unchanged deliveries are skipped", () => {
  assert.deepEqual(
    planPriceChange({ baseline: base(2699, 5), current: { cents: 1000, currencyCode: "EUR" }, triggeredAt: t(5), minPercent: 5 }),
    { skip: "stale" },
  );
  assert.deepEqual(
    planPriceChange({ baseline: base(2699, 1), current: { cents: 2699, currencyCode: "EUR" }, triggeredAt: t(2), minPercent: 5 }),
    { skip: "unchanged" },
  );
});

test("price up: store, no alert", () => {
  const r = planPriceChange({ baseline: base(1999, 1), current: { cents: 2699, currencyCode: "EUR" }, triggeredAt: t(2), minPercent: 5 });
  assert.deepEqual(r, { store: true, drop: null });
});

test("small drop below threshold: store, no alert", () => {
  const r = planPriceChange({ baseline: base(2699, 1), current: { cents: 2599, currencyCode: "EUR" }, triggeredAt: t(2), minPercent: 5 });
  assert.deepEqual(r, { store: true, drop: null });
});

test("real drop: alert with saving and a stable key", () => {
  const r = planPriceChange({ baseline: base(2699, 1), current: { cents: 1754, currencyCode: "EUR" }, triggeredAt: t(2), minPercent: 5 });
  assert.equal(r.store, true);
  assert.equal(r.drop.fromCents, 2699);
  assert.equal(r.drop.toCents, 1754);
  assert.equal(r.drop.savingCents, 945);
  assert.equal(r.drop.percent, 35);
  const again = planPriceChange({ baseline: base(2699, 1), current: { cents: 1754, currencyCode: "EUR" }, triggeredAt: t(3), minPercent: 5 });
  assert.equal(again.drop.key, r.drop.key);
});

test("currency change resets the baseline without alerting", () => {
  const r = planPriceChange({ baseline: base(2699, 1), current: { cents: 1000, currencyCode: "GBP" }, triggeredAt: t(2), minPercent: 5 });
  assert.deepEqual(r, { store: true, drop: null });
});

test("customersWithProduct matches exact ids and skips bad rows", () => {
  const rows = [
    { customerId: "c1", productIds: JSON.stringify([gid(1), gid(2)]) },
    { customerId: "c2", productIds: JSON.stringify([gid(11)]) },
    { customerId: "c3", productIds: "not json" },
  ];
  assert.deepEqual(customersWithProduct(rows, gid(1)), ["c1"]);
});

test("buildPriceDropEvent carries old/new price and a per-customer unique id", () => {
  const body = buildPriceDropEvent({
    drop: { fromCents: 2699, toCents: 1754, savingCents: 945, percent: 35, key: "k" },
    product: { id: gid(9), title: "Strips", handle: "strips", onlineStoreUrl: "https://u", imageUrl: "https://i" },
    currencyCode: "EUR",
    email: "a@b.c",
    customerId: "gid://shopify/Customer/7",
    shop: "s.myshopify.com",
    time: t(2),
  });
  const a = body.data.attributes;
  assert.equal(a.metric.data.attributes.name, METRIC_PRICE_DROP);
  assert.equal(a.properties.Price, 17.54);
  assert.equal(a.properties.OldPrice, 26.99);
  assert.equal(a.properties.Saving, 9.45);
  assert.equal(a.value_currency, "EUR");
  assert.equal(a.unique_id, "pricedrop:9:k:7");
  assert.equal(a.profile.data.attributes.email, "a@b.c");
});
