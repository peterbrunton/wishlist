import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  return { shop: session.shop };
};

export default function SetupGuide() {
  const { shop } = useLoaderData();
  const admin = `https://${shop}/admin`;

  return (
    <s-page heading="Setup guide">
      <s-section heading="1. Add the wishlist button to your theme">
        <s-ordered-list>
          <s-list-item>
            Open the theme editor on an unpublished copy of your theme.
          </s-list-item>
          <s-list-item>
            On the product template, add the{" "}
            <s-text type="strong">Wishlist button</s-text> app block to the
            product information section.
          </s-list-item>
          <s-list-item>
            Optionally add it to product cards on collection, search and home
            page sections.
          </s-list-item>
          <s-list-item>
            Preview, then publish with your next theme release.
          </s-list-item>
        </s-ordered-list>
        <s-link href={`${admin}/themes`} target="_blank">
          Go to themes
        </s-link>
      </s-section>

      <s-section heading="2. Add the Wishlist page to customer accounts">
        <s-ordered-list>
          <s-list-item>
            Go to Settings → Customer accounts and open the account menu.
          </s-list-item>
          <s-list-item>
            Add a menu item that links to the{" "}
            <s-text type="strong">Wishlist</s-text> app page.
          </s-list-item>
          <s-list-item>
            Optionally place the wishlist shortcut block on the Orders page in
            the customer account editor.
          </s-list-item>
        </s-ordered-list>
        <s-link href={`${admin}/settings/customer_accounts`} target="_blank">
          Open customer account settings
        </s-link>
      </s-section>

      <s-section heading="3. Reminder emails">
        <s-paragraph>
          Wishlist activity is sent to Klaviyo as{" "}
          <s-text type="strong">Added to Wishlist</s-text> and{" "}
          <s-text type="strong">Removed from Wishlist</s-text> events. Build
          the reminder flow in Klaviyo using these metrics as the trigger.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
