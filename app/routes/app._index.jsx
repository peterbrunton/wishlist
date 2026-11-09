import { Form, useActionData, useLoaderData, useNavigation } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { METAFIELD_KEY, METAFIELD_NAMESPACE } from "../lib/wishlist.server";
import { syncWishlists, trackedPriceCount } from "../lib/price-drop.server";
import { minDropPercent } from "../lib/price-drop-core";

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);

  const response = await admin.graphql(
    `#graphql
      query WishlistDashboard($namespace: String!, $key: String!) {
        metafieldDefinitions(
          first: 1
          ownerType: CUSTOMER
          namespace: $namespace
          key: $key
        ) {
          nodes {
            id
            type {
              name
            }
            metafieldsCount
          }
        }
      }`,
    { variables: { namespace: METAFIELD_NAMESPACE, key: METAFIELD_KEY } },
  );
  const { data } = await response.json();
  const definition = data?.metafieldDefinitions?.nodes?.[0] ?? null;

  return {
    shop: session.shop,
    priceAlerts: { tracked: await trackedPriceCount(session.shop), minPercent: minDropPercent() },
    metafield: {
      namespace: METAFIELD_NAMESPACE,
      key: METAFIELD_KEY,
      type: definition?.type?.name ?? null,
      customersWithWishlist: definition?.metafieldsCount ?? 0,
      defined: Boolean(definition),
    },
  };
};

// "Sync wishlists": backfills snapshots + price baselines for price-drop alerts. Safe to repeat.
export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  try {
    return { ok: true, result: await syncWishlists(admin, session.shop) };
  } catch (err) {
    console.error("Wishlist sync failed", err);
    return { ok: false, error: String(err?.message ?? err) };
  }
};

export default function Index() {
  const { shop, metafield, priceAlerts } = useLoaderData();
  const sync = useActionData();
  const syncing = useNavigation().state === "submitting";
  const themeEditorUrl = `https://${shop}/admin/themes/current/editor`;

  return (
    <s-page heading="Wishlist">
      <s-button slot="primary-action" href={themeEditorUrl} target="_blank">
        Open theme editor
      </s-button>

      <s-section heading="Overview">
        <s-stack direction="inline" gap="base">
          <s-badge tone={metafield.defined ? "success" : "warning"}>
            {metafield.defined
              ? "Metafield definition found"
              : "No metafield definition yet"}
          </s-badge>
          <s-badge>
            {metafield.customersWithWishlist} customer
            {metafield.customersWithWishlist === 1 ? "" : "s"} with a wishlist
          </s-badge>
        </s-stack>
        <s-paragraph>
          Customers save products with the heart button on the storefront.
          Guest wishlists are kept in the browser and merged into the
          customer&apos;s account when they log in. Customers can manage their
          list from the Wishlist page in their customer account.
        </s-paragraph>
      </s-section>

      <s-section heading="Price-drop alerts">
        <s-paragraph>
          When a saved product&apos;s lowest list price drops by {priceAlerts.minPercent}% or more, every
          customer who saved it gets a &quot;Wishlist Price Drop&quot; event in Klaviyo. Prices tracked:{" "}
          {priceAlerts.tracked}.
        </s-paragraph>
        <Form method="post">
          <s-button type="submit" variant="secondary" loading={syncing || undefined}>
            Sync wishlists and prices
          </s-button>
        </Form>
        {sync?.ok ? (
          <s-banner tone="success">
            Synced {sync.result.customers} wishlists ({sync.result.snapshotsCreated} new),{" "}
            {sync.result.products} saved products ({sync.result.baselinesAdded} new prices). Tracking{" "}
            {sync.result.tracked} prices.
          </s-banner>
        ) : null}
        {sync && !sync.ok ? <s-banner tone="critical">Sync failed: {sync.error}</s-banner> : null}
      </s-section>

      <s-section heading="Storage">
        <s-table>
          <s-table-header-row>
            <s-table-header>Owner</s-table-header>
            <s-table-header>Namespace</s-table-header>
            <s-table-header>Key</s-table-header>
            <s-table-header>Type</s-table-header>
          </s-table-header-row>
          <s-table-body>
            <s-table-row>
              <s-table-cell>Customer</s-table-cell>
              <s-table-cell>{metafield.namespace}</s-table-cell>
              <s-table-cell>{metafield.key}</s-table-cell>
              <s-table-cell>{metafield.type ?? "—"}</s-table-cell>
            </s-table-row>
          </s-table-body>
        </s-table>
      </s-section>

      <s-section slot="aside" heading="Extensions">
        <s-unordered-list>
          <s-list-item>Theme block: wishlist-theme</s-list-item>
          <s-list-item>Account page: wishlist-page</s-list-item>
          <s-list-item>Account shortcut: wishlist-nav</s-list-item>
          <s-list-item>App proxy: /apps/wishlist</s-list-item>
        </s-unordered-list>
        <s-link href="/app/additional">View setup guide</s-link>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
