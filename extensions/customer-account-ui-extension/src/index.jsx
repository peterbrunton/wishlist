import { useCallback, useEffect, useState } from "react";
import {
  reactExtension,
  useApi,
  Grid,
  BlockStack,
  TextBlock,
  Button,
  Image,
  Page,
  ResourceItem,
  SkeletonImage,
  SkeletonText,
} from "@shopify/ui-extensions-react/customer-account";

export default reactExtension(
  "customer-account.page.render",
  () => <FullPageExtension />
);

function FullPageExtension() {
  const { i18n, customer, sessionToken } = useApi();
  const [wishlist, setWishlist] = useState([]);
  const [loading, setLoading] = useState(true);
  const [removeLoading, setRemoveLoading] = useState({ id: null, loading: false });

  function dedupeById(items) {
    const map = new Map();
    for (const item of items) {
      if (item?.id) {
        map.set(item.id, item);
      }
    }
    return Array.from(map.values());
  }

  // ---- Helpers ----
  async function callWishlistApi(method, body) {
    if (!sessionToken) {
      console.error("Session token unavailable; cannot call wishlist API.");
      return null;
    }

    const token = await sessionToken.get();
    const response = await fetch("/public/wishlist", {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const payload = await response.json().catch(() => null);
    return { response, payload };
  }

  async function persistWishlist(updated) {
    try {
      const result = await callWishlistApi("POST", {
        action: "replace",
        wishlist: updated,
      });

      if (!result || !result.response.ok) {
        console.error("Failed to save wishlist to metafield:", result?.payload);
      }
    } catch (err) {
      console.error("Failed to save wishlist to metafield:", err);
    }
  }

  const loadWishlist = useCallback(async () => {
    setLoading(true);
    try {
      if (!customer?.id) {
        setWishlist([]);
        return;
      }

      const result = await callWishlistApi("GET");

      if (!result || !result.response.ok) {
        console.error("Failed to load wishlist from metafield:", result?.payload);
        setWishlist([]);
        return;
      }

      let parsed = [];
      if (typeof result?.payload?.wishlist === "string") {
        try {
          parsed = JSON.parse(result.payload.wishlist || "[]");
        } catch {
          parsed = [];
        }
      } else if (Array.isArray(result?.payload?.wishlist)) {
        parsed = result.payload.wishlist;
      }

      setWishlist(dedupeById(parsed));
    } catch (err) {
      console.error("Error loading wishlist:", err);
      setWishlist([]);
    } finally {
      setLoading(false);
    }
  }, [customer?.id, sessionToken]);

  async function deleteWishlistItem(id) {
    setRemoveLoading({ id, loading: true });
    const updated = wishlist.filter((item) => item.id !== id);
    setWishlist(updated);
    await persistWishlist(updated);
    setRemoveLoading({ id: null, loading: false });
  }

  // ---- Lifecycle ----
  useEffect(() => {
    loadWishlist();
  }, [loadWishlist]);

  // ---- UI ----
  return (
    <Page title="Wishlist">
      <Grid columns={["fill", "fill", "fill"]} rows="auto" spacing="loose">
        {loading && (
          <ResourceItem loading>
            <BlockStack spacing="base">
              <SkeletonImage inlineSize="fill" aspectRatio={1} blockSize="fill" />
              <BlockStack spacing="none">
                <SkeletonText inlineSize="base" />
              </BlockStack>
              <SkeletonText inlineSize="small" />
            </BlockStack>
          </ResourceItem>
        )}

        {!loading &&
          wishlist.length > 0 &&
          wishlist.map((product) => (
            <ResourceItem
              key={product.id}
              action={
                <>
                  <Button kind="primary" to={product.onlineStoreUrl}>
                    View product
                  </Button>
                  <Button
                    kind="secondary"
                    loading={removeLoading.loading && product.id === removeLoading.id}
                    onPress={() => deleteWishlistItem(product.id)}
                  >
                    Remove
                  </Button>
                </>
              }
            >
              <BlockStack spacing="base">
                <Image source={product.featuredImage?.url} />
                <TextBlock emphasis="bold">{product.title}</TextBlock>
                <TextBlock appearance="subdued">
                  {(() => {
                    const amountRaw = product.priceRange?.minVariantPrice?.amount ?? 0;
                    const amount = Number(amountRaw);
                    const currency =
                      product.priceRange?.minVariantPrice?.currencyCode || "USD";
                    return i18n.formatCurrency(
                      Number.isFinite(amount) ? amount : 0,
                      { currency }
                    );
                  })()}
                </TextBlock>
              </BlockStack>
            </ResourceItem>
          ))}

        {!loading && wishlist.length === 0 && (
          <TextBlock>No items in your wishlist.</TextBlock>
        )}
      </Grid>
    </Page>
  );
}
