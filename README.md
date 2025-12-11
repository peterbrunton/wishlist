## Wishlist App – Technical Overview

This document captures the end-to-end flow for the wishlist experience that now spans the Shopify Online Store, Customer Account UI, and the Remix admin app. It reflects the current implementation in this repo and highlights the remaining gaps (e.g. toast for guest users and Flow automations).

---

### 1. Guiding Principles
- **Customer metafield is the canonical source** for wishlist items. Shopify Flow, the customer account UI extension, and storefront surfaces all read from the same record.
- **Local storage is a temporary cache** for guests. On login we merge and clear their browser copy and push the result to the metafield.
- **Metafield writes act as the Flow trigger.** Every add/remove call persists through the Admin API so Flow can react.
- **API access is always authenticated** through Shopify (admin session for app proxy, customer context inside UI extensions).
- **Optimistic UI** on storefront and account surfaces, with rollbacks if the metafield save fails.

---

### 2. Data Surfaces & Flow
1. **Theme App Extension (`extensions/wishlist-theme`)**
   - Liquid block renders a wishlist button for product templates and product cards.
   - Companion JS (`assets/wishlist-icon.js`) keeps multiple buttons in sync, stores guest selections in `localStorage`, and calls the app proxy when the customer is logged in.
   - _(To do)_ show a 4-second toast when a guest adds an item, prompting them to sign in or create an account.

2. **Customer Account UI Extension**
   - Fetches `/api/wishlist.get` via the authenticated extension fetch to hydrate the page.
   - Add/remove actions call the same admin routes, update the metafield, and re-render immediately.

3. **Remix App Proxy Route (`app/routes/apps.wishlist.jsx`)**
   - Entry point for storefront JS. Authenticates with `authenticate.public.appProxy`.
   - Loader returns the customer metafield as JSON.
   - Action handles `add`, `remove`, `sync`, and `replace`, writing through `customerUpdate` → metafield set.
   - Uses Shopify responses to detect and report errors (including userErrors).

4. **Metafield Schema**
   - Namespace: `wishlist`
   - Key: `customer_products`
   - Value: JSON array of `{ id, title, onlineStoreUrl, featuredImage, priceRange }`.

---

### 3. Local Storage & Login Flow
1. Guest toggles the block → product cached under `localStorage["wishlist"]`.
2. _(Pending UI enhancement)_ Immediately fire a toast telling them to log in (dismiss automatically after 4 seconds).
3. Customer logs in → storefront JS calls `POST /apps/wishlist?action=sync` with the local array.
4. App Proxy merges duplicates server-side and persists to metafield.
5. Local storage clears so the metafield remains the single source moving forward.

> The same pattern applies in the customer account extension: when a shopper is visiting the account UI we skip local storage entirely because they are already authenticated.

---

### 4. Shopify Flow & Email Automation
- Flow should watch the `customer.metafields.wishlist.customer_products` metafield for updates.
- Suggested flow:
  1. **Trigger:** Customer metafield updated.
  2. **Condition:** metafield array length > 0 and `acceptsMarketing` is true.
  3. **Actions:** Send reminder email(s) via Shopify Email and add helper tags (e.g. `wishlist_email_sent_day`, `wishlist_email_sent_week`) to prevent duplicate sends.
- Because every wishlist action writes through the Admin API, the metafield change occurs consistently and can power the Flow.
- Tags are optional now that the metafield is authoritative, but you may still add them in Flow if you want to distinguish message cadence.

---

### 5. App Configuration Requirements
- **Scopes:** `read_customers`, `write_customers`, `read_metafields`, `write_metafields`.
- **App Proxy:** Configure in the Partner Dashboard to match the `[app_proxy]` block in `shopify.app.toml` (`prefix = apps`, `subpath = wishlist`).
- **Theme Setup:** In Theme Editor add the “Wishlist button” block (from the `wishlist-theme` extension) to the desired product sections/templates.
- **Account Extension:** Deploy via `shopify app deploy` and enable the extension in the Shopify admin.

---

### 6. Remaining Enhancements
- Implement the 4-second toast for guest interactions (can leverage a minimal inline component or Polaris if you inject styles).
- Optional: Introduce a durable database (Postgres via Prisma) if you need reporting or history beyond the metafield payload.
- Expand error telemetry (e.g. logging metafield userErrors to an app log or monitoring tool).

---

### 7. Development Notes
```bash
pnpm install
pnpm prisma generate
pnpm dev        # wraps `shopify app dev`
```

To target a different development store, run:
```bash
shopify app dev --store=my-test-store.myshopify.com
```

---

### 8. Deployment
1. `pnpm build`
2. `shopify app deploy`
3. In the Shopify admin, publish the extensions (theme block + customer account UI) and configure Flow + Email automation against the metafield.

---

### 9. Glossary
- **App Proxy:** Authenticated storefront → admin bridge for REST/GraphQL.
- **Metafield Mirror:** The shared JSON payload keyed under `wishlist/customer_products`.
- **Guest Cache:** Local storage copy held only until next authenticated sync.

---

For further Remix-specific details (environment setup, deployment options, etc.) consult the upstream Shopify Remix template docs if needed.
