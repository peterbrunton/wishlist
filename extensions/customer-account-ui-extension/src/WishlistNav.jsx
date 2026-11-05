import { extension, BlockStack, Text, Button } from "@shopify/ui-extensions/customer-account";

export default extension("customer-account.order-index.block.render", (root) => {
  const stack = root.createComponent(BlockStack, { spacing: "base" });

  stack.appendChild(root.createComponent(Text, { emphasis: "bold" }, ["Your wishlist"]));
  stack.appendChild(root.createComponent(Text, {}, ["View items you've saved for later."]));

  const btn = root.createComponent(Button, { kind: "primary", to: "extension:wishlist-page" });
  btn.appendChild(root.createComponent(Text, {}, ["Open wishlist"]));
  stack.appendChild(btn);

  root.appendChild(stack);
});
