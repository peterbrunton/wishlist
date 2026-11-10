// Pure wishlist logic: no network, no Shopify client. Unit-tested in wishlist-core.test.js.

// Shopify list metafields hold at most 128 items; keep headroom.
export const MAX_ITEMS = 100;

export const ACTIONS = /** @type {const} */ (["add", "remove", "merge", "replace"]);

const PRODUCT_GID = /^gid:\/\/shopify\/Product\/(\d+)$/;

export class WishlistError extends Error {
  /** @param {number} status @param {string} message */
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/**
 * Accepts a product GID, a numeric ID (string or number), or an object with an `id`.
 * Returns a canonical `gid://shopify/Product/123` string, or null if it isn't one.
 */
export function toProductGid(value) {
  const raw = value && typeof value === "object" ? value.id : value;
  if (typeof raw === "number" && Number.isSafeInteger(raw) && raw > 0) {
    return `gid://shopify/Product/${raw}`;
  }
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (PRODUCT_GID.test(trimmed)) return trimmed;
  if (/^\d+$/.test(trimmed)) return `gid://shopify/Product/${trimmed}`;
  return null;
}

/** Normalises a list of mixed inputs to unique product GIDs, keeping first-seen order. */
export function normalizeIds(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const gid = toProductGid(item);
    if (gid && !seen.has(gid)) {
      seen.add(gid);
      out.push(gid);
    }
  }
  return out;
}

/** Parses a stored metafield value (JSON array) into product GIDs. */
export function parseStoredIds(value) {
  if (!value) return [];
  try {
    return normalizeIds(JSON.parse(value));
  } catch {
    return [];
  }
}

/**
 * Parses a client request body into `{ action, ids }`.
 *
 * Accepted shapes (kept compatible with the current storefront and account page):
 *   { action: "add" | "remove", product: { id } }   or   { action, productId }
 *   { action: "merge" | "sync", wishlist: [ids or { id }] }
 *   { action: "replace", wishlist: [...] }   (legacy account page: applied as removals only)
 */
export function parseRequestBody(body) {
  if (!body || typeof body !== "object") {
    throw new WishlistError(400, "Invalid JSON payload");
  }
  const action = body.action === "sync" ? "merge" : body.action;
  if (!ACTIONS.includes(action)) {
    throw new WishlistError(400, "Unsupported action");
  }

  if (action === "add" || action === "remove") {
    const gid = toProductGid(body.product ?? body.productId);
    if (!gid) throw new WishlistError(400, "Missing or invalid product id");
    return { action, ids: [gid] };
  }

  if (!Array.isArray(body.wishlist)) {
    throw new WishlistError(400, "wishlist must be an array");
  }
  return { action, ids: normalizeIds(body.wishlist).slice(0, MAX_ITEMS) };
}

/**
 * Applies a change to the current list. Newest items go first; the oldest are dropped past MAX_ITEMS.
 * `replace` never adds — it only removes items missing from the incoming list, so a client
 * can't inject products through it.
 *
 * @returns {{ next: string[], added: string[], removed: string[], changed: boolean }}
 */
export function applyChange(current, action, ids) {
  const currentSet = new Set(current);
  let next;

  switch (action) {
    case "add":
    case "merge": {
      const fresh = ids.filter((id) => !currentSet.has(id));
      next = [...fresh, ...current];
      break;
    }
    case "remove": {
      const drop = new Set(ids);
      next = current.filter((id) => !drop.has(id));
      break;
    }
    case "replace": {
      const keep = new Set(ids);
      next = current.filter((id) => keep.has(id));
      break;
    }
    default:
      throw new WishlistError(400, "Unsupported action");
  }

  next = next.slice(0, MAX_ITEMS);
  const nextSet = new Set(next);
  const added = next.filter((id) => !currentSet.has(id));
  const removed = current.filter((id) => !nextSet.has(id));

  return { next, added, removed, changed: added.length > 0 || removed.length > 0 };
}
