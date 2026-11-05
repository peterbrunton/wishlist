import {
  extension,
  BlockStack,
  Grid,
  Text,
  Button,
  Banner,
  Image,
  Page,
  SkeletonImage,
  SkeletonText,
} from "@shopify/ui-extensions/customer-account";

const API_URL = "https://wishlist-2026-app.fly.dev/public/wishlist";
const LOCAL_STORAGE_KEY = "wishlist";
const SKELETON_COUNT = 3;

// ---- Utilities ----

function dedupeById(items = []) {
  const map = new Map();
  for (const item of items) {
    if (item?.id) map.set(item.id, item);
  }
  return Array.from(map.values());
}

function readLocalWishlist() {
  try {
    const raw = typeof localStorage !== "undefined" && localStorage.getItem(LOCAL_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function clearLocalWishlist() {
  try {
    if (typeof localStorage !== "undefined") localStorage.removeItem(LOCAL_STORAGE_KEY);
  } catch { /* ignore */ }
}

function parseWishlist(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try { return JSON.parse(value); } catch { return []; }
}

function shopFromToken(token) {
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return payload.dest?.replace(/^https?:\/\//, "") || null;
  } catch {
    return null;
  }
}

// ---- Extension entry ----

export default extension("customer-account.page.render", (root, api) => {
  const { sessionToken, i18n } = api;

  let wishlist = [];
  let hasError = false;

  // ---- API helpers ----

  async function callApi(method, body) {
    const token = await sessionToken.get();
    const shop = shopFromToken(token);
    const url = shop ? `${API_URL}?shop=${encodeURIComponent(shop)}` : API_URL;
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const payload = await res.json().catch(() => null);
    if (!res.ok) throw new Error(payload?.error || `HTTP ${res.status}`);
    return payload;
  }

  async function fetchWishlist() {
    const payload = await callApi("GET");
    return parseWishlist(payload?.wishlist);
  }

  async function saveWishlist(items) {
    await callApi("POST", { action: "replace", wishlist: items });
  }

  // ---- UI tree ----

  const page = root.createComponent(Page, { title: "Wishlist" });
  root.appendChild(page);

  const outerStack = root.createComponent(BlockStack, { spacing: "loose" });
  page.appendChild(outerStack);

  let errorBanner = null;

  const grid = root.createComponent(Grid, {
    columns: ["fill", "fill", "fill"],
    rows: "auto",
    spacing: "loose",
  });
  outerStack.appendChild(grid);

  let emptyText = null;

  // ---- Skeletons ----

  function buildSkeleton() {
    const item = root.createComponent(BlockStack, { spacing: "base" });
    item.appendChild(root.createComponent(SkeletonImage, { inlineSize: "fill", aspectRatio: 1 }));
    const lines = root.createComponent(BlockStack, { spacing: "extraTight" });
    lines.appendChild(root.createComponent(SkeletonText, { inlineSize: "base" }));
    lines.appendChild(root.createComponent(SkeletonText, { inlineSize: "small" }));
    item.appendChild(lines);
    return item;
  }

  let skeletons = [];

  function showSkeletons() {
    skeletons = Array.from({ length: SKELETON_COUNT }, () => {
      const s = buildSkeleton();
      grid.appendChild(s);
      return s;
    });
  }

  function removeSkeletons() {
    for (const s of skeletons) grid.removeChild(s);
    skeletons = [];
  }

  // ---- Error banner ----

  function showError(detail) {
    if (errorBanner) return;
    const banner = root.createComponent(Banner, { status: "critical", title: "Could not load your wishlist" });
    const stack = root.createComponent(BlockStack, { spacing: "base" });
    const msg = root.createComponent(Text);
    msg.appendChild(root.createText(detail ? `Error: ${detail}` : "Something went wrong. Please try again."));
    stack.appendChild(msg);
    const btn = root.createComponent(Button, { kind: "secondary", onPress: () => load() });
    btn.appendChild(root.createText("Try again"));
    stack.appendChild(btn);
    banner.appendChild(stack);
    outerStack.insertBefore(banner, grid);
    errorBanner = banner;
  }

  function hideError() {
    if (errorBanner) { outerStack.removeChild(errorBanner); errorBanner = null; }
  }

  // ---- Product cards ----

  const productNodes = new Map();

  function formatPrice(product) {
    const amount = Number(product.priceRange?.minVariantPrice?.amount ?? 0);
    const currency = product.priceRange?.minVariantPrice?.currencyCode || "USD";
    return i18n.formatCurrency(Number.isFinite(amount) ? amount : 0, { currency });
  }

  async function handleRemove(id) {
    const previous = wishlist.slice();
    wishlist = wishlist.filter((item) => item.id !== id);
    renderWishlist();
    try {
      await saveWishlist(wishlist);
    } catch {
      wishlist = previous;
      renderWishlist();
    }
  }

  function buildProductCard(product) {
    const card = root.createComponent(BlockStack, { spacing: "base" });

    if (product.featuredImage?.url) {
      card.appendChild(root.createComponent(Image, { source: product.featuredImage.url }));
    }

    const title = root.createComponent(Text, { emphasis: "bold" });
    title.appendChild(root.createText(product.title || ""));
    card.appendChild(title);

    const price = root.createComponent(Text, { appearance: "subdued" });
    price.appendChild(root.createText(formatPrice(product)));
    card.appendChild(price);

    const actions = root.createComponent(BlockStack, { spacing: "tight" });

    if (product.onlineStoreUrl) {
      const viewBtn = root.createComponent(Button, { kind: "primary", to: product.onlineStoreUrl });
      viewBtn.appendChild(root.createText("View product"));
      actions.appendChild(viewBtn);
    }

    const removeBtn = root.createComponent(Button, { kind: "secondary", onPress: () => handleRemove(product.id) });
    removeBtn.appendChild(root.createText("Remove"));
    actions.appendChild(removeBtn);

    card.appendChild(actions);
    return card;
  }

  function renderWishlist() {
    for (const node of productNodes.values()) grid.removeChild(node);
    productNodes.clear();

    if (emptyText) { grid.removeChild(emptyText); emptyText = null; }

    if (wishlist.length === 0) {
      emptyText = root.createComponent(Text, { appearance: "subdued" });
      emptyText.appendChild(root.createText("No items in your wishlist yet."));
      grid.appendChild(emptyText);
      return;
    }

    for (const product of wishlist) {
      const card = buildProductCard(product);
      productNodes.set(product.id, card);
      grid.appendChild(card);
    }
  }

  // ---- Load ----

  async function load() {
    hideError();
    hasError = false;
    if (skeletons.length === 0) showSkeletons();

    try {
      const localItems = readLocalWishlist();
      if (localItems.length) {
        await callApi("POST", { action: "sync", wishlist: localItems });
        clearLocalWishlist();
      }
      wishlist = dedupeById(await fetchWishlist());
    } catch (e) {
      hasError = true;
      showError(e?.message || String(e));
    } finally {
      removeSkeletons();
      if (!hasError) renderWishlist();
    }
  }

  showSkeletons();
  load();
});
