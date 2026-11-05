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
  Box,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  return { shop: session.shop };
};

export default function Index() {
  const { shop } = useLoaderData();

  return (
    <Page>
      <TitleBar title="Wishlist" />
      <BlockStack gap="500">
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">
                    Wishlist 2026
                  </Text>
                  <Text variant="bodyMd" as="p">
                    Let customers save products they love and come back for them
                    later. Wishlists are stored on each customer's Shopify
                    account as a metafield and sync across your storefront and
                    the customer account portal.
                  </Text>
                </BlockStack>
                <InlineStack gap="200">
                  <Badge tone="success">App proxy active</Badge>
                  <Badge tone="success">Customer account extension ready</Badge>
                  <Badge tone="attention">Theme block: install required</Badge>
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  How it works
                </Text>
                <List type="number">
                  <List.Item>
                    A customer taps the heart icon button on any product page.
                    Guests are saved to local storage; logged-in customers sync
                    to their Shopify account automatically.
                  </List.Item>
                  <List.Item>
                    The wishlist is persisted as a JSON metafield on the
                    customer object (namespace:{" "}
                    <Box as="span" display="inline">
                      <code>wishlist</code>
                    </Box>
                    , key:{" "}
                    <Box as="span" display="inline">
                      <code>customer_products</code>
                    </Box>
                    ).
                  </List.Item>
                  <List.Item>
                    Customers can view and manage their full wishlist from the
                    Customer Account portal — a dedicated wishlist page and an
                    order-index shortcut are both included out of the box.
                  </List.Item>
                </List>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <BlockStack gap="500">
              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">
                    Extensions
                  </Text>
                  <BlockStack gap="200">
                    <InlineStack align="space-between">
                      <Text variant="bodyMd" as="span">
                        Theme block
                      </Text>
                      <Badge>wishlist-theme</Badge>
                    </InlineStack>
                    <InlineStack align="space-between">
                      <Text variant="bodyMd" as="span">
                        Wishlist page
                      </Text>
                      <Badge>wishlist-page</Badge>
                    </InlineStack>
                    <InlineStack align="space-between">
                      <Text variant="bodyMd" as="span">
                        Account nav block
                      </Text>
                      <Badge>wishlist-nav</Badge>
                    </InlineStack>
                    <InlineStack align="space-between">
                      <Text variant="bodyMd" as="span">
                        App proxy path
                      </Text>
                      <Badge tone="success">/apps/wishlist</Badge>
                    </InlineStack>
                  </BlockStack>
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">
                    Metafield reference
                  </Text>
                  <BlockStack gap="100">
                    <InlineStack align="space-between">
                      <Text variant="bodyMd" as="span">
                        Owner
                      </Text>
                      <Text variant="bodyMd" as="span">
                        Customer
                      </Text>
                    </InlineStack>
                    <InlineStack align="space-between">
                      <Text variant="bodyMd" as="span">
                        Namespace
                      </Text>
                      <Text variant="bodyMd" as="span">
                        <code>wishlist</code>
                      </Text>
                    </InlineStack>
                    <InlineStack align="space-between">
                      <Text variant="bodyMd" as="span">
                        Key
                      </Text>
                      <Text variant="bodyMd" as="span">
                        <code>customer_products</code>
                      </Text>
                    </InlineStack>
                    <InlineStack align="space-between">
                      <Text variant="bodyMd" as="span">
                        Type
                      </Text>
                      <Text variant="bodyMd" as="span">
                        <code>json</code>
                      </Text>
                    </InlineStack>
                  </BlockStack>
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>
        </Layout>

        <Layout>
          <Layout.Section>
            <Banner title="Add the wishlist button to your theme" tone="info">
              <BlockStack gap="200">
                <Text variant="bodyMd" as="p">
                  The wishlist heart icon is a theme app extension block. You
                  need to add it to your product page template once via the
                  theme editor.
                </Text>
                <InlineStack gap="300">
                  <Link
                    url={`https://${shop}/admin/themes/current/editor`}
                    target="_blank"
                    removeUnderline
                  >
                    Open Theme Editor
                  </Link>
                  <Link url="/app/additional" removeUnderline>
                    View step-by-step guide
                  </Link>
                </InlineStack>
              </BlockStack>
            </Banner>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
