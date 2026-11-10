import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_ITEMS,
  WishlistError,
  applyChange,
  normalizeIds,
  parseRequestBody,
  parseStoredIds,
  toProductGid,
} from "./wishlist-core.js";

const gid = (n) => `gid://shopify/Product/${n}`;

test("toProductGid accepts GIDs, numeric ids and { id } objects", () => {
  assert.equal(toProductGid(gid(1)), gid(1));
  assert.equal(toProductGid("42"), gid(42));
  assert.equal(toProductGid(42), gid(42));
  assert.equal(toProductGid({ id: gid(7), title: "ignored" }), gid(7));
});

test("toProductGid rejects anything that isn't a product", () => {
  for (const bad of [null, undefined, "", "abc", -1, 1.5, "gid://shopify/Customer/1", { id: "x" }, gid("1;drop")]) {
    assert.equal(toProductGid(bad), null, `expected null for ${JSON.stringify(bad)}`);
  }
});

test("normalizeIds dedupes and keeps first-seen order", () => {
  assert.deepEqual(normalizeIds([gid(2), "1", { id: gid(2) }, "junk", 1]), [gid(2), gid(1)]);
  assert.deepEqual(normalizeIds("not an array"), []);
});

test("parseStoredIds handles legacy snapshot JSON and bad values", () => {
  const legacy = JSON.stringify([{ id: gid(9), title: "T", priceRange: {} }, { id: gid(8) }]);
  assert.deepEqual(parseStoredIds(legacy), [gid(9), gid(8)]);
  assert.deepEqual(parseStoredIds(JSON.stringify([gid(1)])), [gid(1)]);
  assert.deepEqual(parseStoredIds("{broken"), []);
  assert.deepEqual(parseStoredIds(null), []);
});

test("parseRequestBody: add/remove need one valid product", () => {
  assert.deepEqual(parseRequestBody({ action: "add", product: { id: gid(1) } }), { action: "add", ids: [gid(1)] });
  assert.deepEqual(parseRequestBody({ action: "remove", productId: "5" }), { action: "remove", ids: [gid(5)] });
  assert.throws(() => parseRequestBody({ action: "add", product: { id: "nope" } }), WishlistError);
});

test("parseRequestBody: sync is an alias for merge; lists are capped", () => {
  const many = Array.from({ length: MAX_ITEMS + 20 }, (_, i) => i + 1);
  const { action, ids } = parseRequestBody({ action: "sync", wishlist: many });
  assert.equal(action, "merge");
  assert.equal(ids.length, MAX_ITEMS);
});

test("parseRequestBody rejects unknown actions and bad bodies", () => {
  for (const body of [null, "x", {}, { action: "delete_everything" }, { action: "merge", wishlist: "x" }]) {
    assert.throws(() => parseRequestBody(body), (e) => e instanceof WishlistError && e.status === 400);
  }
});

test("applyChange add puts new items first and ignores duplicates", () => {
  const r = applyChange([gid(1), gid(2)], "add", [gid(3)]);
  assert.deepEqual(r.next, [gid(3), gid(1), gid(2)]);
  assert.deepEqual(r.added, [gid(3)]);
  assert.equal(r.changed, true);

  const same = applyChange([gid(1)], "add", [gid(1)]);
  assert.equal(same.changed, false);
  assert.deepEqual(same.next, [gid(1)]);
});

test("applyChange remove drops only the given items", () => {
  const r = applyChange([gid(1), gid(2), gid(3)], "remove", [gid(2), gid(99)]);
  assert.deepEqual(r.next, [gid(1), gid(3)]);
  assert.deepEqual(r.removed, [gid(2)]);
});

test("applyChange merge adds only unseen items", () => {
  const r = applyChange([gid(1)], "merge", [gid(2), gid(1), gid(3)]);
  assert.deepEqual(r.next, [gid(2), gid(3), gid(1)]);
  assert.deepEqual(r.added, [gid(2), gid(3)]);
});

test("applyChange replace can remove but never add", () => {
  const r = applyChange([gid(1), gid(2)], "replace", [gid(2), gid(50)]);
  assert.deepEqual(r.next, [gid(2)]);
  assert.deepEqual(r.added, []);
  assert.deepEqual(r.removed, [gid(1)]);
});

test("applyChange caps the list and drops the oldest", () => {
  const current = Array.from({ length: MAX_ITEMS }, (_, i) => gid(i + 1));
  const r = applyChange(current, "add", [gid(1000)]);
  assert.equal(r.next.length, MAX_ITEMS);
  assert.equal(r.next[0], gid(1000));
  assert.ok(!r.next.includes(gid(MAX_ITEMS)), "oldest item dropped");
  assert.deepEqual(r.removed, [gid(MAX_ITEMS)]);
});

// Request shapes sent by the extension versions released in March 2026 (still live until
// `shopify app deploy`). The new backend must keep accepting them during the release window.
test("legacy client payloads are still accepted", () => {
  const snapshot = (n) => ({
    id: gid(n),
    handle: "h",
    title: "T",
    onlineStoreUrl: "/products/h",
    featuredImage: { url: "https://cdn/x.jpg" },
    priceRange: { minVariantPrice: { amount: "5.02", currencyCode: "EUR" } },
  });
  assert.deepEqual(parseRequestBody({ action: "add", product: snapshot(1) }), { action: "add", ids: [gid(1)] });
  assert.deepEqual(parseRequestBody({ action: "remove", product: snapshot(1) }), { action: "remove", ids: [gid(1)] });
  assert.deepEqual(parseRequestBody({ action: "sync", wishlist: [snapshot(1), snapshot(2)] }), {
    action: "merge",
    ids: [gid(1), gid(2)],
  });
  const replace = parseRequestBody({ action: "replace", wishlist: [snapshot(2)] });
  assert.deepEqual(applyChange([gid(1), gid(2)], replace.action, replace.ids).next, [gid(2)]);
});
