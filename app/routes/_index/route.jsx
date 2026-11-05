import { redirect } from "@remix-run/node";
import { Form, useLoaderData } from "@remix-run/react";
import { login } from "../../shopify.server";
import styles from "./styles.module.css";

export const loader = async ({ request }) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export default function App() {
  const { showForm } = useLoaderData();

  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1 className={styles.heading}>Wishlist 2026</h1>
        <p className={styles.text}>
          Let your customers save products they love and come back for them later.
        </p>
        {showForm && (
          <Form className={styles.form} method="post" action="/auth/login">
            <label className={styles.label}>
              <span>Shop domain</span>
              <input className={styles.input} type="text" name="shop" />
              <span>e.g: my-shop-domain.myshopify.com</span>
            </label>
            <button className={styles.button} type="submit">
              Log in
            </button>
          </Form>
        )}
        <ul className={styles.list}>
          <li>
            <strong>Heart icon on every product</strong>. A one-click theme
            block lets customers save any product directly from your storefront.
          </li>
          <li>
            <strong>Syncs across devices</strong>. Logged-in customers always
            see their wishlist — guest wishlists merge automatically on login.
          </li>
          <li>
            <strong>Built into the customer portal</strong>. Customers can view
            and manage their wishlist from the Customer Account page, no extra
            setup needed.
          </li>
        </ul>
      </div>
    </div>
  );
}
