import { json } from "@remix-run/node";
import { authenticate } from "~/shopify.server";

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  const body = await request.json();
  const { customerId, wishlist } = body ?? {};

  if (!customerId) {
    return json({ error: "Missing customerId" }, { status: 400 });
  }

  if (wishlist === undefined) {
    return json({ error: "Missing wishlist payload" }, { status: 400 });
  }

  const wishlistValue =
    typeof wishlist === "string" ? wishlist : JSON.stringify(wishlist);

  const mutation = `#graphql
    mutation SaveCustomerWishlist($customerId: ID!, $wishlist: String!) {
      customerUpdate(input: {
        id: $customerId
        metafields: [
          {
            namespace: "wishlist"
            key: "customer_products"
            type: "json"
            value: $wishlist
          }
        ]
      }) {
        customer {
          id
          metafields(first: 1, namespace: "wishlist", keys: ["customer_products"]) {
            edges {
              node {
                key
                value
              }
            }
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  try {
    const response = await admin.graphql(mutation, {
      variables: { customerId, wishlist: wishlistValue },
    });
    const data = await response.json();

    if (!response.ok) {
      return json(
        { error: "Wishlist save failed", details: data?.errors ?? null },
        { status: response.status }
      );
    }

    const mutationResult = data?.data?.customerUpdate;
    if (!mutationResult) {
      return json(
        { error: "Wishlist save failed", details: data?.errors ?? null },
        { status: 502 }
      );
    }

    if (mutationResult.userErrors?.length) {
      return json({ errors: mutationResult.userErrors }, { status: 400 });
    }

    return json({ success: true, data: mutationResult.customer ?? null });
  } catch (err) {
    console.error("Wishlist save error:", err);
    return json({ error: "Wishlist save failed" }, { status: 500 });
  }
};
