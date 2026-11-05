import "@shopify/ui-extensions/preact";
import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import { readWishlist } from "./wishlist-api";

export default async () => {
  render(<WishlistNav />, document.body);
};

function WishlistNav() {
  const t = shopify.i18n.translate;
  const [count, setCount] = useState(null);

  useEffect(() => {
    readWishlist()
      .then(({ ids }) => setCount(ids.length))
      .catch(() => setCount(0));
  }, []);

  if (count === null) return null;

  return (
    <s-query-container>
      <s-section heading={t("nav.heading")}>
        <s-stack direction="block" gap="base">
          <s-paragraph>{count > 0 ? t("nav.count", { count }) : t("nav.empty")}</s-paragraph>
          <s-stack direction="inline" gap="base">
            <s-button variant="primary" href="extension:wishlist-page/">
              {t("nav.open")}
            </s-button>
          </s-stack>
        </s-stack>
      </s-section>
    </s-query-container>
  );
}
