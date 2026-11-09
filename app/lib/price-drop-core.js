// Pure logic for wishlist price-drop alerts. Unit-tested.
//
// A product's "price" here is its lowest variant list price in shop currency (priceRangeV2.minVariantPrice).
// We keep the last price we saw per product (ProductPrice row). When an Events API delivery says a
// variant price changed, we compare the new lowest price with that baseline.

export const METRIC_PRICE_DROP = "Wishlist Price Drop";
export const DEFAULT_MIN_DROP_PERCENT = 5;

/** Money string → integer cents (avoids float drift when comparing). Returns null if unusable. */
export function toCents(amount) {
  const n = Number(amount);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}

export function minDropPercent(env = process.env) {
  const n = Number(env.PRICE_DROP_MIN_PERCENT);
  return Number.isFinite(n) && n > 0 && n < 100 ? n : DEFAULT_MIN_DROP_PERCENT;
}

/** Extracts the product and its current lowest price from a Product price Events API payload. */
export function readPricePayload(payload) {
  const product = payload?.data?.product;
  const price = product?.priceRangeV2?.minVariantPrice;
  const cents = toCents(price?.amount);
  if (!product?.id || cents === null || !price?.currencyCode) return null;
  return {
    productId: product.id,
    status: product.status ?? null,
    cents,
    currencyCode: price.currencyCode,
    product: {
      id: product.id,
      title: product.title ?? null,
      handle: product.handle ?? null,
      onlineStoreUrl: product.onlineStoreUrl ?? null,
      imageUrl: product.featuredMedia?.preview?.image?.url ?? null,
    },
  };
}

/**
 * Decides what one price delivery means.
 *
 * @param {object} input
 * @param {{ cents: number, currencyCode: string, lastEventAt: Date, updatedAt: Date } | null} input.baseline
 * @param {{ cents: number, currencyCode: string }} input.current
 * @param {Date} input.triggeredAt
 * @param {number} input.minPercent
 * @returns {{ skip: string } | { store: true, drop: null | { fromCents: number, toCents: number, savingCents: number, percent: number, key: string } }}
 */
export function planPriceChange({ baseline, current, triggeredAt, minPercent }) {
  if (baseline && triggeredAt.getTime() <= baseline.lastEventAt.getTime()) return { skip: "stale" };
  // No baseline: we can't tell what it was, so just remember it (Sync seeds baselines up front).
  if (!baseline || baseline.currencyCode !== current.currencyCode) return { store: true, drop: null };
  if (current.cents === baseline.cents) return { skip: "unchanged" };
  // Price went up (e.g. sale ended): store it, so the next drop alerts again.
  if (current.cents > baseline.cents) return { store: true, drop: null };

  const savingCents = baseline.cents - current.cents;
  const percent = Math.round((savingCents / baseline.cents) * 1000) / 10;
  if (percent < minPercent) return { store: true, drop: null };

  return {
    store: true,
    drop: {
      fromCents: baseline.cents,
      toCents: current.cents,
      savingCents,
      percent,
      // Same drop from the same baseline → same key, so concurrent or retried deliveries
      // (one per changed variant) can't alert twice; a later sale has a new baseline time.
      key: `${baseline.updatedAt.getTime()}:${baseline.cents}->${current.cents}`,
    },
  };
}

/** Customers whose saved list contains the product. `snapshots` rows hold productIds as a JSON string. */
export function customersWithProduct(snapshots, productId) {
  const out = [];
  for (const row of snapshots) {
    let ids;
    try {
      ids = JSON.parse(row.productIds);
    } catch {
      continue;
    }
    if (Array.isArray(ids) && ids.includes(productId)) out.push(row.customerId);
  }
  return out;
}

export const DEFAULT_BATCH_MINUTES = 10;

/** How long to collect drops for one customer before sending (PRICE_DROP_BATCH_MINUTES, default 10). */
export function batchWindowMs(env = process.env) {
  const n = Number(env.PRICE_DROP_BATCH_MINUTES);
  return (Number.isFinite(n) && n >= 0 && n <= 24 * 60 ? n : DEFAULT_BATCH_MINUTES) * 60_000;
}

/** Stable id for one queued drop, so per-variant and retried deliveries upsert the same row. */
export function pendingDropId(shop, customerId, productId, key) {
  return `${shop}:${customerId}:${productId}:${key}`;
}

/**
 * Groups unsent queued drops by customer and returns the groups whose first drop is at least
 * `windowMs` old. Within a group, several drops of the same product collapse into one item
 * (first "from" price, latest "to" price). Items are sorted by biggest saving first.
 *
 * @param {Array<{ id: string, shop: string, customerId: string, email: string, productId: string,
 *   fromCents: number, toCents: number, currencyCode: string, product: string, createdAt: Date }>} rows
 */
export function dueBatches(rows, now, windowMs) {
  const groups = new Map();
  for (const row of rows) {
    const k = `${row.shop}|${row.customerId}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(row);
  }
  const out = [];
  for (const list of groups.values()) {
    list.sort((a, b) => a.createdAt - b.createdAt);
    if (now.getTime() - list[0].createdAt.getTime() < windowMs) continue;
    const byProduct = new Map();
    for (const row of list) {
      const prev = byProduct.get(row.productId);
      byProduct.set(row.productId, prev ? { ...row, fromCents: prev.fromCents } : row);
    }
    const items = [...byProduct.values()]
      .filter((r) => r.toCents < r.fromCents)
      .map((r) => {
        let product = {};
        try {
          product = JSON.parse(r.product);
        } catch {
          // keep empty
        }
        const savingCents = r.fromCents - r.toCents;
        return {
          productId: r.productId,
          fromCents: r.fromCents,
          toCents: r.toCents,
          savingCents,
          percent: Math.round((savingCents / r.fromCents) * 1000) / 10,
          currencyCode: r.currencyCode,
          product,
        };
      })
      .sort((a, b) => b.savingCents - a.savingCents);
    out.push({
      shop: list[0].shop,
      customerId: list[0].customerId,
      email: list[list.length - 1].email,
      rowIds: list.map((r) => r.id),
      firstRowId: list[0].id,
      items,
    });
  }
  return out;
}

/**
 * Klaviyo "Create Event" body (revision 2026-10-15) for one customer and all their dropped items.
 * Top-level product fields describe the biggest saving (for subject lines); `Items` lists them all.
 */
export function buildPriceDropBatchEvent({ batch, time }) {
  const money = (cents) => cents / 100;
  const items = batch.items.map((it) => ({
    ProductID: it.productId.split("/").pop(),
    ProductGID: it.productId,
    ProductName: it.product.title ?? null,
    ProductHandle: it.product.handle ?? null,
    URL: it.product.onlineStoreUrl ?? null,
    ImageURL: it.product.imageUrl ?? null,
    Price: money(it.toCents),
    OldPrice: money(it.fromCents),
    Saving: money(it.savingCents),
    SavingPercent: it.percent,
    Currency: it.currencyCode,
  }));
  const top = items[0];
  const total = batch.items.reduce((sum, it) => sum + it.savingCents, 0);
  return {
    data: {
      type: "event",
      attributes: {
        properties: {
          ...top,
          Items: items,
          ItemCount: items.length,
          TotalSaving: money(total),
          ShopifyCustomerID: batch.customerId.split("/").pop(),
          Shop: batch.shop,
          Source: "Wishlist app",
        },
        time: time.toISOString(),
        value: top.Price,
        value_currency: top.Currency,
        // One alert per batch; Klaviyo drops repeats with the same id (retries).
        unique_id: `pricedrop:${batch.firstRowId}`,
        metric: { data: { type: "metric", attributes: { name: METRIC_PRICE_DROP } } },
        profile: { data: { type: "profile", attributes: { email: batch.email } } },
      },
    },
  };
}
