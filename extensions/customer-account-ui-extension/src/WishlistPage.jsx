import "@shopify/ui-extensions/preact";
import { render } from "preact";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { addToCartUrl, loadProducts, readWishlist, removeFromWishlist } from "./wishlist-api";

// The page only loads once when opened, so saves made on the storefront in another tab would
// not appear. Extensions run sandboxed with no tab-visibility events, so re-check the saved list
// on a timer instead (ids only; products reload only when the list changed) and stop after an hour.
const REFRESH_MS = 20_000;
const REFRESH_FOR_MS = 60 * 60_000;

export default async () => {
  render(<WishlistPage />, document.body);
};

function WishlistPage() {
  const t = shopify.i18n.translate;
  const [status, setStatus] = useState("loading");
  const [products, setProducts] = useState([]);
  const [removing, setRemoving] = useState(() => new Set());
  const [errorDetail, setErrorDetail] = useState("");

  const loadedIds = useRef(null);
  const removingRef = useRef(removing);
  removingRef.current = removing;

  const load = useCallback(async () => {
    setStatus("loading");
    let step = "read";
    try {
      const { ids } = await readWishlist();
      step = "products";
      setProducts(await loadProducts(ids));
      loadedIds.current = ids.join(",");
      setStatus("ready");
    } catch (err) {
      console.error("Wishlist load failed", step, err);
      setErrorDetail(`${step}: ${err?.message || String(err)}`);
      setStatus("error");
    }
  }, []);

  // Silent background check: no spinner, errors ignored (the next tick tries again).
  const refresh = useCallback(async () => {
    if (loadedIds.current === null || removingRef.current.size) return;
    try {
      const { ids } = await readWishlist();
      const key = ids.join(",");
      if (key === loadedIds.current || removingRef.current.size) return;
      const next = await loadProducts(ids);
      if (removingRef.current.size) return;
      loadedIds.current = key;
      setProducts(next);
    } catch (err) {
      console.warn("Wishlist refresh failed", err);
    }
  }, []);

  useEffect(() => {
    load();
    const started = Date.now();
    const timer = setInterval(() => {
      if (Date.now() - started > REFRESH_FOR_MS) clearInterval(timer);
      else refresh();
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load, refresh]);

  async function remove(product) {
    const previous = products;
    setRemoving((s) => new Set(s).add(product.id));
    setProducts((list) => list.filter((p) => p.id !== product.id));
    try {
      const ids = await removeFromWishlist(product.id);
      loadedIds.current = ids.join(",");
      shopify.toast.show(t("item.removed"));
    } catch (err) {
      console.error("Wishlist remove failed", err);
      setProducts(previous);
      shopify.toast.show(t("item.remove_failed"));
    } finally {
      setRemoving((s) => {
        const next = new Set(s);
        next.delete(product.id);
        return next;
      });
    }
  }

  if (status === "loading") {
    return (
      <s-page heading={t("page.title")}>
        <s-section>
          <s-stack direction="block" gap="base" alignItems="center">
            <s-spinner accessibilityLabel={t("page.loading")}></s-spinner>
          </s-stack>
        </s-section>
      </s-page>
    );
  }

  if (status === "error") {
    return (
      <s-page heading={t("page.title")}>
        <s-banner heading={t("page.error_heading")} tone="critical">
          <s-stack direction="block" gap="base">
            <s-paragraph>{t("page.error_body")}</s-paragraph>
            {errorDetail ? <s-paragraph>{`Details: ${errorDetail}`}</s-paragraph> : null}
            <s-button variant="secondary" onClick={load}>
              {t("page.retry")}
            </s-button>
          </s-stack>
        </s-banner>
      </s-page>
    );
  }

  return (
    <s-page heading={t("page.title")}>
      {products.length === 0 ? (
        <s-section>
          <s-paragraph>{t("page.empty")}</s-paragraph>
        </s-section>
      ) : (
        <s-query-container>
          <s-grid
            gridTemplateColumns="@container (inline-size > 560px) 1fr 1fr 1fr 1fr, 1fr 1fr"
            gap="base"
          >
            {products.map((product) => (
              <WishlistItem
                key={product.id}
                product={product}
                busy={removing.has(product.id)}
                onRemove={() => remove(product)}
              />
            ))}
          </s-grid>
        </s-query-container>
      )}
    </s-page>
  );
}

function WishlistItem({ product, busy, onRemove }) {
  const t = shopify.i18n.translate;
  const price = product.priceRange?.minVariantPrice;
  const cartUrl = addToCartUrl(product);

  const image = product.featuredImage?.url ? (
    <s-image
      src={product.featuredImage.url}
      alt={product.featuredImage.altText || product.title}
      aspectRatio="1"
      objectFit="cover"
      borderRadius="base"
      loading="lazy"
    ></s-image>
  ) : null;

  // Card: clickable image + title open the product; one full-width action; a small Remove link.
  return (
    <s-stack direction="block" gap="small-200">
      {product.url && image ? <s-clickable href={product.url}>{image}</s-clickable> : image}
      <s-stack direction="block" gap="small-500">
        {product.url ? (
          <s-link href={product.url}>{product.title}</s-link>
        ) : (
          <s-text type="strong">{product.title}</s-text>
        )}
        {price ? (
          <s-text color="subdued">
            {shopify.i18n.formatCurrency(Number(price.amount), { currency: price.currencyCode })}
          </s-text>
        ) : null}
        {!product.availableForSale ? <s-badge tone="neutral">{t("item.sold_out")}</s-badge> : null}
      </s-stack>
      {cartUrl ? (
        <s-button variant="primary" inlineSize="fill" href={cartUrl}>
          {t("item.add_to_cart")}
        </s-button>
      ) : product.url ? (
        <s-button variant="secondary" inlineSize="fill" href={product.url}>
          {t("item.view")}
        </s-button>
      ) : null}
      {busy ? (
        <s-text color="subdued">{t("item.removing")}</s-text>
      ) : (
        <s-link
          tone="critical"
          accessibilityLabel={String(t("item.remove_label", { title: product.title }))}
          onClick={onRemove}
        >
          {t("item.remove")}
        </s-link>
      )}
    </s-stack>
  );
}
