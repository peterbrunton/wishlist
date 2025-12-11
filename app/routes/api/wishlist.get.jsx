import { json } from "@remix-run/node";
import { authenticate } from "~/shopify.server";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  const url = new URL(request.url);
  const customerId = url.searchParams.get("customerId");

  if (!customerId) {
    return json({ error: "Missing customerId" }, { status: 400 });
  }

  const query = `#graphql
    query GetCustomerWishlist($customerId: ID!) {
      customer(id: $customerId) {
        id
        metafield(namespace: "wishlist", key: "customer_products") {
          value
        }
      }
    }
  `;

  try {
    const response = await admin.graphql(query, { variables: { customerId } });
    const data = await response.json();

    if (!response.ok) {
      return json(
        { error: "Wishlist fetch failed", details: data?.errors ?? null },
        { status: response.status }
      );
    }

    const customer = data?.data?.customer;

    if (!customer?.metafield?.value) {
      return json({ wishlist: "[]" });
    }

    return json({ wishlist: customer.metafield.value });
  } catch (err) {
    console.error("Wishlist fetch error:", err);
    return json({ error: "Wishlist fetch failed" }, { status: 500 });
  }
};
