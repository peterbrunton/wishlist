import { useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  Text,
  Badge,
  List,
  Link,
  Banner,
  Divider,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  return { shop: session.shop };
};

export default function SetupGuide() {
  const { shop } = useLoaderData();
  const themeEditorUrl = `https://${shop}/admin/themes/current/editor`;

  return (
    <Page>
      <TitleBar title="Setup Guide" />
      <BlockStack gap="500">
        <Layout>
          <Layout.Section>
            <Banner tone="info" title="Three steps to get wishlists live on your store">
              <Text variant="bodyMd" as="p">
                The customer account extension and app proxy activate
                automatically. The only manual step is adding the theme block to
                your product pages.
              </Text>
            </Banner>
          </Layout.Section>
        </Layout>

        <Layout>
          <Layout.Section>
            <BlockStack gap="400">
              <Card>
                <BlockStack gap="400">
                  <InlineStack align="space-between" blockAlign="center">
                    <InlineStack gap="300" blockAlign="center">
                      <Text as="h2" variant="headingMd">
                        Step 1 — Add the wishlist button to your theme
                      </Text>
                    </InlineStack>
                    <Badge tone="attention">Action required</Badge>
                  </InlineStack>
                  <Text variant="bodyMd" as="p">
                    The wishlist heart icon is a theme app extension block. Add
                    it once to your product page template and it will appear on
                    every product automatically.
                  </Text>
                  <List type="number">
                    <List.Item>
                      Open your{" "}
                      <Link url={themeEditorUrl} target="_blank" removeUnderline>
                        Theme Editor
                      </Link>
                      .
                    </List.Item>
                    <List.Item>
                      Navigate to a <strong>Product page</strong> template in
                      the left panel.
                    </List.Item>
                    <List.Item>
                      Click <strong>Add block</strong> inside the product
                      information section.
                    </List.Item>
                    <List.Item>
                      Find <strong>Wishlist button</strong> under the Apps
                      category and click it to add.
                    </List.Item>
                    <List.Item>
                      Optionally customise the button label and guest prompt
                      text in the block settings.
                    </List.Item>
                    <List.Item>
                      Click <strong>Save</strong>.
                    </List.Item>
                  </List>
                  <Text variant="bodyMd" as="p">
                    The block can also be added to collection, search, and index
                    templates to let customers wishlist products without
                    navigating to the product page.
                  </Text>
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="400">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text as="h2" variant="headingMd">
                      Step 2 — Customer account extension
                    </Text>
                    <Badge tone="success">Auto-enabled</Badge>
                  </InlineStack>
                  <Text variant="bodyMd" as="p">
                    Two customer account UI extension targets are deployed
                    automatically with the app:
                  </Text>
                  <BlockStack gap="200">
                    <InlineStack gap="200" blockAlign="center">
                      <Badge>wishlist-page</Badge>
                      <Text variant="bodyMd" as="span">
                        A full-page wishlist view accessible from the customer
                        portal at{" "}
                        <code>extension:wishlist-page</code>.
                      </Text>
                    </InlineStack>
                    <InlineStack gap="200" blockAlign="center">
                      <Badge>wishlist-nav</Badge>
                      <Text variant="bodyMd" as="span">
                        A shortcut block on the order index page linking
                        customers to their wishlist.
                      </Text>
                    </InlineStack>
                  </BlockStack>
                  <Text variant="bodyMd" as="p">
                    Customers can view their wishlist, see product images and
                    prices, and remove items directly from the portal.
                  </Text>
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="400">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text as="h2" variant="headingMd">
                      Step 3 — Test the wishlist
                    </Text>
                    <Badge tone="success">No action required</Badge>
                  </InlineStack>
                  <List type="number">
                    <List.Item>
                      Visit a product page on your storefront. You should see
                      the heart icon button.
                    </List.Item>
                    <List.Item>
                      Click it while <strong>logged out</strong> — the item
                      saves to local storage and a toast prompts the customer to
                      log in.
                    </List.Item>
                    <List.Item>
                      Log in to a customer account. The local wishlist syncs to
                      the customer's metafield automatically on the next page
                      load.
                    </List.Item>
                    <List.Item>
                      Open the Customer Account portal and navigate to the
                      Wishlist page. The saved product should appear there.
                    </List.Item>
                  </List>
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <BlockStack gap="500">
              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">
                    Guest wishlist behaviour
                  </Text>
                  <Text variant="bodyMd" as="p">
                    Guests can add products to a wishlist stored in browser
                    local storage under the key <code>wishlist</code>.
                  </Text>
                  <Text variant="bodyMd" as="p">
                    When they log in, their local items are merged into their
                    account wishlist automatically — nothing is lost.
                  </Text>
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">
                    Supported templates
                  </Text>
                  <Text variant="bodyMd" as="p">
                    The wishlist block can be enabled on:
                  </Text>
                  <List>
                    <List.Item>Product</List.Item>
                    <List.Item>Collection</List.Item>
                    <List.Item>Search</List.Item>
                    <List.Item>List collections</List.Item>
                    <List.Item>Home (index)</List.Item>
                  </List>
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">
                    App proxy
                  </Text>
                  <Text variant="bodyMd" as="p">
                    The storefront wishlist button communicates through the
                    Shopify app proxy at:
                  </Text>
                  <Text variant="bodyMd" as="p">
                    <code>/apps/wishlist</code>
                  </Text>
                  <Text variant="bodyMd" as="p">
                    All requests are signed by Shopify — no additional
                    authentication is needed on the storefront.
                  </Text>
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
