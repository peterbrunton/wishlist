import {
  reactExtension,
  BlockStack,
  TextBlock,
  Button,
} from "@shopify/ui-extensions-react/customer-account";

export default reactExtension(
  "customer-account.order-index.block.render",
  () => <WishlistNav />
);

function WishlistNav() {
  return (
    <BlockStack spacing="base">
      <TextBlock emphasis="bold">Your wishlist</TextBlock>
      <TextBlock>View items you've saved for later.</TextBlock>
      <Button kind="primary" to="extension:wishlist-page">
        Open wishlist
      </Button>
    </BlockStack>
  );
}
