# Wishlist App – Build From Scratch

Use this guide to recreate the current wishlist experience in a new Shopify app project. It assumes familiarity with the Shopify CLI, Remix, and basic theme customization.

---

## 1. Prerequisites
- Node.js 18.20+ (or 20.10+)
- PNPM 8+
- Shopify CLI (`npm i -g @shopify/cli`)
- A Shopify Partner account with a development store

---

## 2. Scaffold the Remix App
```bash
shopify app init wishlist --template=remix
cd wishlist
pnpm install
```

The CLI generates `shopify.app.toml`, a default Remix app, and a sample customer account extension. We will replace most files with the versions from this repo.

---

## 3. Copy Application Code
Replace the generated files with the contents from this project:

| Path | Purpose |
| --- | --- |
| `app/` | Remix routes, including `/apps/wishlist` proxy and wishlist APIs |
| `extensions/customer-account-ui-extension/` | Customer account UI extension |
| `extensions/wishlist-theme/` | Theme app extension with wishlist button block |
| `shopify.app.toml` | App configuration (scopes, proxy, extensions) |
| `shopify.web.toml`, `vite.config.js`, `remix.config.js` | Build tooling |

You can copy the files directly or merge with your repo as needed.

---

## 4. Configure Environment Variables
Create a `.env` file (or use Shopify CLI `shopify app env pull`) with:

```
SHOPIFY_API_KEY=xxx
SHOPIFY_API_SECRET=xxx
SCOPES=read_customers,write_customers,read_metafields,write_metafields
SHOPIFY_APP_URL=https://<your-ngrok-or-tunnel>
```

The CLI will inject store-specific variables when you run `shopify app dev`.

---

## 5. App Proxy Setup
The project relies on an app proxy to service storefront requests:

- In the [Partner Dashboard](https://partners.shopify.com/), open your app → **Extensions** → **App proxies**.
- Add a proxy with:
  - **Subpath prefix:** `apps`
  - **Subpath:** `wishlist`
  - **Proxy URL:** `https://<your-app-domain>/apps/wishlist`

These values must match the `[app_proxy]` block in `shopify.app.toml`.

---

## 6. Customer Account UI Extension
The extension lives in `extensions/customer-account-ui-extension`:

1. Install dependencies: `pnpm install` (from the repo root).
2. Ensure the manifest (`shopify.extension.toml`) targets `customer-account.page.render` and enables `network_access`.
3. The `src/index.jsx` component already fetches and mutates the metafield via the app’s `/api` routes.

You’ll publish the extension after deploying the app.

---

## 7. Theme App Extension
Located in `extensions/wishlist-theme`:

1. `blocks/wishlist-icon.liquid` renders the button and binds product data to `data-*` attributes.
2. `assets/wishlist-icon.js` handles local storage, app proxy calls, and optimistic UI.
3. After deployment, add the “Wishlist button” block to product templates or product-card sections from the theme editor.

> To prompt guests, extend `wishlist-icon.js` with a 4-second toast (pending enhancement).

---

## 8. Remix Routes (Wishlist APIs)
- `app/routes/api/wishlist.get.jsx` and `wishlist.save.jsx` serve the customer account extension.
- `app/routes/apps.wishlist.jsx` handles storefront traffic via the app proxy (loader for GET, action for POST).

All routes use the Admin API to read/write the metafield (`wishlist/customer_products`), ensuring Shopify Flow can react to changes.

---

## 9. Local Development
```bash
pnpm dev                    # runs `shopify app dev`
```

If you need a different dev store:
```bash
shopify app dev --store=my-dev-store.myshopify.com
```

The CLI opens the embedded app and tunnels your local server.

---

## 10. Deploy & Publish
1. `pnpm build`
2. `shopify app deploy`
3. In the Shopify admin:
   - Publish the customer account UI extension.
   - Install the theme app extension, then add the “Wishlist button” block to the desired theme (test on a draft theme first).

---

## 11. Configure Shopify Flow
Create a workflow triggered by “Customer metafield updated”:

1. Condition: `customer.metafields.wishlist.customer_products` length > 0.
2. Optional: Check `customer.acceptsMarketing`.
3. Actions: Send Shopify Email reminders and/or add helper tags for cadence.

Because every wishlist change writes through the metafield, Flow will fire reliably.

---

## 12. Optional Enhancements
- Add datastore persistence (Prisma + Postgres) if you need analytics or history.
- Implement the 4-second toast for guest interactions.
- Add error monitoring around metafield writes (e.g. console logging → external telemetry).

---

With these steps you can recreate the wishlist functionality from this repo in a fresh Shopify app project. Adjust naming, styling, or additional features as your use case evolves.
