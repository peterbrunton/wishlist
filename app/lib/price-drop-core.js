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

/** Klaviyo "Create Event" body for one customer (revision 2026-10-15), profile matched by email. */
export function buildPriceDropEvent({ drop, product, currencyCode, email, customerId, shop, time }) {
  const money = (cents) => cents / 100;
  return {
    data: {
      type: "event",
      attributes: {
        properties: {
          ProductID: product.id.split("/").pop(),
          ProductGID: product.id,
          ProductName: product.title,
          ProductHandle: product.handle,
          URL: product.onlineStoreUrl,
          ImageURL: product.imageUrl,
          Price: money(drop.toCents),
          OldPrice: money(drop.fromCents),
          Saving: money(drop.savingCents),
          SavingPercent: drop.percent,
          Currency: currencyCode,
          ShopifyCustomerID: customerId.split("/").pop(),
          Shop: shop,
          Source: "Wishlist app",
        },
        time: time.toISOString(),
        value: money(drop.toCents),
        value_currency: currencyCode,
        unique_id: `pricedrop:${product.id.split("/").pop()}:${drop.key}:${customerId.split("/").pop()}`,
        metric: { data: { type: "metric", attributes: { name: METRIC_PRICE_DROP } } },
        profile: { data: { type: "profile", attributes: { email } } },
      },
    },
  };
}
