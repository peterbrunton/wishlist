import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { METAFIELD_KEY, METAFIELD_NAMESPACE } from "../lib/wishlist.server";

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
    metafield: {
      namespace: METAFIELD_NAMESPACE,
      key: METAFIELD_KEY,
      type: definition?.type?.name ?? null,
      customersWithWishlist: definition?.metafieldsCount ?? 0,
      defined: Boolean(definition),
    },
  };
};

export default function Index() {
  const { shop, metafield } = useLoaderData();
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
