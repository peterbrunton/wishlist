import "@shopify/ui-extensions/preact";
import { render } from "preact";
import { useCallback, useEffect, useState } from "preact/hooks";
import { addToCartUrl, loadProducts, readWishlist, removeFromWishlist } from "./wishlist-api";

export default async () => {
  render(<WishlistPage />, document.body);
};

function WishlistPage() {
  const t = shopify.i18n.translate;
  const [status, setStatus] = useState("loading");
  const [products, setProducts] = useState([]);
  const [removing, setRemoving] = useState(() => new Set());
  const [errorDetail, setErrorDetail] = useState("");

  const load = useCallback(async () => {
    setStatus("loading");
    let step = "read";
    try {
      const { ids } = await readWishlist();
      step = "products";
      setProducts(await loadProducts(ids));
      setStatus("ready");
    } catch (err) {
      console.error("Wishlist load failed", step, err);
      setErrorDetail(`${step}: ${err?.message || String(err)}`);
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function remove(product) {
    const previous = products;
    setRemoving((s) => new Set(s).add(product.id));
    setProducts((list) => list.filter((p) => p.id !== product.id));
    try {
      await removeFromWishlist(product.id);
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

  return (
    <s-section>
      <s-stack direction="block" gap="base">
        {product.featuredImage?.url ? (
          <s-image
            src={product.featuredImage.url}
            alt={product.featuredImage.altText || product.title}
            aspectRatio="1"
            objectFit="cover"
            loading="lazy"
          ></s-image>
        ) : null}
        <s-stack direction="block" gap="small-200">
          <s-text type="strong">{product.title}</s-text>
          {price ? (
            <s-text color="subdued">
              {shopify.i18n.formatCurrency(Number(price.amount), { currency: price.currencyCode })}
            </s-text>
          ) : null}
          {!product.availableForSale ? <s-badge tone="neutral">{t("item.sold_out")}</s-badge> : null}
        </s-stack>
        <s-stack direction="block" gap="small-200">
          {cartUrl ? (
            <s-button variant="primary" href={cartUrl}>
              {t("item.add_to_cart")}
            </s-button>
          ) : null}
          {product.url ? (
            <s-button variant={cartUrl ? "secondary" : "primary"} href={product.url}>
              {t("item.view")}
            </s-button>
          ) : null}
          <s-button
            variant="secondary"
            tone="critical"
            loading={busy}
            accessibilityLabel={String(t("item.remove_label", { title: product.title }))}
            onClick={onRemove}
          >
            {t("item.remove")}
          </s-button>
        </s-stack>
      </s-stack>
    </s-section>
  );
}
