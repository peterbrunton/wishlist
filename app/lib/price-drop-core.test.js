import { test } from "node:test";
import assert from "node:assert/strict";
import {
  METRIC_PRICE_DROP,
  batchWindowMs,
  buildPriceDropBatchEvent,
  dueBatches,
  pendingDropId,
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

const row = (o) => ({
  id: pendingDropId("s", o.c ?? "gid://shopify/Customer/7", o.p, o.k ?? "k"),
  shop: "s",
  customerId: o.c ?? "gid://shopify/Customer/7",
  email: "a@b.c",
  productId: o.p,
  fromCents: o.from,
  toCents: o.to,
  currencyCode: "EUR",
  product: JSON.stringify({ id: o.p, title: o.t ?? "P", onlineStoreUrl: "https://u", imageUrl: "https://i" }),
  createdAt: o.at,
});

test("batchWindowMs defaults to 10 minutes", () => {
  assert.equal(batchWindowMs({}), 600_000);
  assert.equal(batchWindowMs({ PRICE_DROP_BATCH_MINUTES: "1" }), 60_000);
  assert.equal(batchWindowMs({ PRICE_DROP_BATCH_MINUTES: "0" }), 0);
});

test("dueBatches waits for the window, then groups a customer's drops into one batch", () => {
  const rows = [
    row({ p: gid(1), from: 2699, to: 1999, at: t(0), t: "Strips" }),
    row({ p: gid(2), from: 4999, to: 2999, at: t(30), t: "Brush" }),
  ];
  assert.equal(dueBatches(rows, t(40), 60_000).length, 0);
  const due = dueBatches(rows, new Date(t(0).getTime() + 60_000), 60_000);
  assert.equal(due.length, 1);
  assert.equal(due[0].items.length, 2);
  assert.equal(due[0].items[0].product.title, "Brush"); // biggest saving first
  assert.equal(due[0].rowIds.length, 2);
});

test("dueBatches keeps customers separate and collapses repeat drops of one product", () => {
  const rows = [
    row({ p: gid(1), from: 2699, to: 2299, at: t(0), k: "a" }),
    row({ p: gid(1), from: 2299, to: 1999, at: t(5), k: "b" }),
    row({ p: gid(1), from: 2699, to: 1999, at: t(0), c: "gid://shopify/Customer/8" }),
  ];
  const due = dueBatches(rows, t(59), 0);
  assert.equal(due.length, 2);
  const c7 = due.find((b) => b.customerId.endsWith("/7"));
  assert.equal(c7.items.length, 1);
  assert.equal(c7.items[0].fromCents, 2699);
  assert.equal(c7.items[0].toCents, 1999);
});

test("buildPriceDropBatchEvent lists every item and leads with the biggest saving", () => {
  const [batch] = dueBatches(
    [
      row({ p: gid(1), from: 2699, to: 1999, at: t(0), t: "Strips" }),
      row({ p: gid(2), from: 4999, to: 2999, at: t(1), t: "Brush" }),
    ],
    t(59),
    0,
  );
  const a = buildPriceDropBatchEvent({ batch, time: t(59) }).data.attributes;
  assert.equal(a.metric.data.attributes.name, METRIC_PRICE_DROP);
  assert.equal(a.properties.ItemCount, 2);
  assert.equal(a.properties.ProductName, "Brush");
  assert.equal(a.properties.Price, 29.99);
  assert.equal(a.properties.OldPrice, 49.99);
  assert.equal(a.properties.Items[1].ProductName, "Strips");
  assert.equal(a.properties.TotalSaving, 27);
  assert.equal(a.unique_id, `pricedrop:${batch.firstRowId}`);
  assert.equal(a.profile.data.attributes.email, "a@b.c");
});
