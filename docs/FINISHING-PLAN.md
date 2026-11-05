# Wishlist 2026 – Audit & Finishing Plan

_Audit date: 2026-11-05 · Repo: `~/LIVE/apps/wishlist` · Target API: **2026-10** (latest stable, supported to 16 Oct 2027)_

---

## 1. Where it stands

| Area | State |
| --- | --- |
| App | Remix 2.16 + `@shopify/shopify-app-remix` 3.7, Prisma/SQLite sessions, Fly.io (`wishlist-2026-app`, region **syd**) |
| API version | App + webhooks `2025-10`, customer account extension `2025-07`. **Both are now unsupported.** 2025-10 was retired on 16 Oct 2026, so Shopify is serving these requests at the oldest supported version. |
| Theme app extension | Heart button block, guest localStorage, login toast (**already built**, even though the README says it's still to do), sync on login |
| Customer account extension | Full-page wishlist plus an order-index nav block. It uses the legacy `extension()`/`createComponent` API. |
| Storage | JSON metafield **`custom.wishlist_products`**. The README and admin page still say `wishlist.customer_products`, so the docs are out of date. |
| Git | Last commit 30 Jan. About **20 files of March work are uncommitted** (+643 / −972). |
| Linked dev store | `spotlightoralcaredev.myshopify.com` |

---

## 2. Audit findings

### Must fix
1. **The app is on retired API versions** (see above). Move the app, webhooks and extensions to 2026-10.
2. **Remix is legacy.** Shopify now recommends `@shopify/shopify-app-react-router`. The Remix package only gets maintenance from here on.
3. **The customer account extension uses the pre-Polaris API.** 2025-07 is the last version with that API. From 2025-10 onward extensions use Preact + Polaris web components (`<s-page>`, `<s-grid>`, …). Shopify has a migration guide for each component.
4. **The client sends product data and the server saves it as sent.** Title, price, image and URL all come from the browser:
   - Prices go stale, and the currency comes from `shop.currency`. **The EU store with Markets will show the wrong currency and price** (for example GBP/SEK shoppers see EUR values).
   - Any logged-in customer can write any JSON (up to the metafield size limit) into their own record.
5. **`replace` action from the account page.** "Remove" sends the whole list back. If the same customer has two tabs or devices open, one overwrites the other, and `replace` lets a client set anything. There's also no concurrency guard on any write. Every write is a read, then a modify, then a write.
6. **Collection pages make N requests.** Each block on the page calls `ensureState()` before the first one finishes. A 24-card collection page fires up to 24 GETs, and up to 24 `sync` POSTs if the guest had local items.

### Should fix
7. If several blocks on a page show the same product, they don't stay in sync. Only the block that was clicked updates.
8. The `MutationObserver` only starts if there were **no** blocks on first load. Cards added later aren't bound: Horizon section re-renders, filtering, infinite scroll, quick view.
9. The customer account extension reads and clears `localStorage`. That does nothing, because extensions run in a sandboxed worker on a different origin. Guest merge already happens on the storefront.
10. **No translations:** "Log in", "No product available…", "Wishlist", "Remove" and "View product" are hardcoded in English. The extension `locales/en.default.json` is template leftover ("earnPoints…"). The EU store needs its store languages.
11. `apps.wishlist.jsx` and `public.wishlist.jsx` repeat the same action logic. Move it into `wishlist.server.js`.
12. Scopes are broader than needed: `write_products`, `read_metaobjects` and `write_metaobjects` aren't used.
13. Fly runs in **Sydney** with `min_machines_running = 0`. The EU store gets ~300 ms of extra latency on every proxy call, plus cold starts that can exceed the app proxy timeout.
14. The customer account extension has the API URL hardcoded (`wishlist-2026-app.fly.dev`) and adds a `?shop=` param that isn't needed.

### Nice to have
15. Add a header count or icon (app embed) and a storefront `/apps/wishlist` page for shoppers who don't use the account area.
16. Add an "Add to cart" button on account page items.
17. Delete `.git.bak` and the stale `docs/build-from-scratch.md` once the rebuild lands.

---

## 3. Target architecture (recommended)

**Store product references, not product snapshots.**

- An app-owned metafield, declared in `shopify.app.toml`:
  ```toml
  [customer.metafields.app.wishlist]
  name = "Wishlist"
  type = "list.product_reference"
  access.admin = "merchant_read"
  access.customer_account = "read_write"
  ```
- **Storefront:** Liquid reads the metafield and renders the initial heart state. That removes the GET on page load. Prices and images always come from live product data in the shopper's market currency.
- **Writes** go through one server function that uses `metafieldsSet` with **`compareDigest`** (optimistic concurrency) and only supports `add | remove | merge`. It checks that each GID is a real, published product and enforces a size cap.
- **Customer account page:** queries the customer's metafield and products directly through the Customer Account API (`access.customer_account = read_write`). The account page then doesn't need the backend at all.
- **Guests:** localStorage holds product GIDs only. They're merged once on login.
- **Automation:** a Flow trigger extension "Wishlist item added" (customer + product), so Flow, Shopify Email or Klaviyo can react. This is more reliable than watching a JSON metafield for changes.

> To verify during build (2026-10 docs): Liquid read path for `$app` customer metafields from a theme app extension, and Customer Account API `metafieldsSet` on `$app` namespaces.

---

## 4. Finishing plan

### Phase 0 – Checkpoint ✅ done 2026-11-05
- [x] Committed the March WIP to `main` (`e4b87df`, local only, not pushed) and branched `feature/2026-10-upgrade`.
- [x] Deployed: **active app version from 2026-03-31 13:45** (17 versions in total).
- [ ] Fly health: `/` returns 200, but the **first request took 27 s (cold start)**; warm requests take 0.4 s. This confirms the hosting fix in Phase 6. `fly status` needs `flyctl auth login` (Peter).
- [x] Live EU data: the definition `custom.wishlist_products` (merchant-owned JSON, storefront PUBLIC_READ) exists, with **1 metafield in total**. That one is Peter's own test customer (3 products, last updated 2026-04-01). The saved prices (€5.02 for an X3 bundle, €79.27, €63.41) look wrong, which backs up finding #4.
  - **Migration:** there's no real customer data. Skip the migration script, or just re-add Peter's 3 test items by hand.
  - **Cleanup after launch:** delete the old `custom.wishlist_products` definition and value on live EU (ask first).
- [ ] The dev store `spotlightoralcaredev` hasn't been checked yet, because the connector is on EU live. Check it when `shopify app dev` runs in Phase 1.

### Phase 1 – Platform upgrade ✅ code done 2026-11-05 (branch `feature/2026-10-upgrade`)
- [x] Remix → React Router 7.18.2 + `@shopify/shopify-app-react-router` 3.0.x, matched to Shopify's current React Router app template. Flat routes are kept via `@react-router/fs-routes`. `remix.config.js` and the `@remix-run/*` / `@shopify/polaris` dependencies are removed.
- [x] `ApiVersion.October26` (app + `.graphqlrc.js`) and `[webhooks] api_version = "2026-10"`. `future.expiringOfflineAccessTokens` is on, with a Prisma migration adding `refreshToken` / `refreshTokenExpires`.
- [x] Node **24** LTS (`.nvmrc`, Dockerfile `node:24-alpine`, engines `>=22.12`). pnpm is pinned to 10.27.0 via `packageManager`. **`pnpm-lock.yaml` is now committed**, because the Dockerfile uses `--frozen-lockfile`.
- [x] Admin pages are rebuilt in Polaris web components. The dashboard shows the live metafield definition and the number of customers with a wishlist. The setup guide covers the theme block, the customer account menu, and Klaviyo.
- [x] Scopes trimmed to `read_customers, read_products, write_customers`.
- [x] Webhooks declared in TOML: `app/uninstalled`, `app/scopes_update`, plus GDPR compliance topics → `webhooks.compliance.jsx`.
- [x] All GraphQL validated against 2026-10. `pnpm build` and `pnpm lint` pass. Prod server smoke test: `/` and `/auth/login` return 200, and calls without credentials are rejected.
- [x] **Dev/prod configs separated (2026-11-05):**
  - `shopify.app.dev.toml` → the existing dev app **wishlist-2026** (`0e19…`, previously used with a Cloudflare tunnel) on `spotlightoralcaredev`. URLs update automatically on dev.
  - `shopify.app.toml` → **production** Wishlist 2026 (`d75bf…`), now with `automatically_update_urls_on_dev = false`.
  - `pnpm dev` = `shopify app dev --config dev`; `pnpm deploy` = production (ask first); `pnpm deploy:dev` = dev app.
  - `shopify app config use dev` is set as this checkout's local default.
  - Known dev caveats:
    - The customer account extension hardcodes `https://wishlist-2026-app.fly.dev`, so in dev it calls the **prod** backend and will fail auth. Phase 4 removes that call.
    - If the production app is also installed on the dev store, both apps claim `/apps/wishlist`. Uninstall the prod app from the dev store if the proxy misbehaves.
    - Two unused apps, both called "wishlist" (`ed31…`, `b2b8…`, URLs `example.com`), can be deleted in the Dev Dashboard (Peter).
- [ ] Install via dev config on the dev store and click through the admin pages (needs Peter: CLI login/interactive).
- [ ] The customer account extension is still on `2025-07`. That's intentional: its code rewrite is Phase 4.

### Phase 2 – Data model & server ✅ code done 2026-11-05
- [x] Declared `[customer.metafields.app.wishlist]` (`list.product_reference`; admin `merchant_read`, storefront `public_read`, customer account `read_write`) in **both** app configs.
- [x] Split the logic in two:
  - `app/lib/wishlist-core.js` (pure): ID normalising, request parsing, `applyChange`. Newest items go first, with a cap of 100 (the Shopify list max is 128).
  - `app/lib/wishlist.server.js` (GraphQL): reads and writes `$app:wishlist`. Writes use `metafieldsSet` + `compareDigest` (null on first write), with one retry on `STALE_OBJECT`, then a 409. An empty list deletes the metafield.
- [x] Only **ACTIVE products** can be added: IDs are checked server-side, and the client's titles and prices are ignored.
- [x] **Migration happens lazily, so no script is needed.** If `$app:wishlist` doesn't exist yet, the read falls back to legacy `custom.wishlist_products`, and the next write saves those items to the new metafield. That covers Peter's 3-item test record on EU live.
- [x] Both routes use one shared `handleWishlistApi`. `replace` still exists for the current account page, but it can **only remove**, never add. The proxy now trusts only the signed `logged_in_customer_id` query param, not the unsigned header.
- [x] Responses are compatible with the current clients: `{ ids, added, removed, wishlist: [hydrated products] }`. Hydrated prices are in the shop currency (EUR) until Phases 3–4 render live market prices. `added`/`removed` are there ready for the Klaviyo events in Phase 5.
- [x] 12 unit tests (`pnpm test`, `node:test`); all GraphQL validated against 2026-10. Build and lint pass. Proxy smoke test: a valid signature gets through, a forged one returns 400.
- [ ] On the dev store, confirm `featuredMedia` returns images with the current scopes (the validator listed `read_files` among possible scopes). Also confirm the dashboard's `metafieldDefinitions(namespace: "$app")` resolves.

### Phase 3 – Theme app extension ✅ code done 2026-11-05
- [x] **Initial state comes from Liquid.** The block reads `customer.metafields['$app'].wishlist`, so logged-in customers trigger **0 requests on page load**. If the list has more than 50 items (Liquid's loop limit), the page makes one shared GET.
- [x] Product lookup order is `closest.product` → `product`. Horizon `_product-card`, `_product-details` and the product sections all accept `@app`. The old `card_product` fallback was dropped because it was never in scope for an app block.
- [x] The client sends **only product GIDs**, so all the price, title and image data attributes are gone. Old snapshot objects in localStorage are converted to GIDs automatically.
- [x] **One shared state:**
  - Every button for the same product updates together.
  - Guest items merge with one POST on login.
  - Each product has a pending lock, so a double-click sends one request.
  - A failed request rolls back the heart and shows an error toast.
  - A `wishlist:change` DOM event (`{ ids, count }`) is ready for a header count later.
  - Guests stay in sync across tabs via the `storage` event.
- [x] The MutationObserver is **always on**, so Horizon section re-renders, filtering and quick view get bound. Clicks inside card links no longer navigate.
- [x] **Translations:** storefront strings in `en / de / fr / es`, matching the store's published locales. German uses informal "du" like the theme. Theme editor labels are in `en.default.schema.json`.
- [x] **Settings:** icon size (16–40 px), icon colour (blank = text colour), show label, and optional custom text overrides. The new setting IDs mean old saved English labels no longer override translations.
- [x] **Accessibility:** `aria-pressed`, `aria-label`, `aria-busy`, a focus ring, and a toast with `role=status` + `aria-live`. Reduced motion is respected. CSS has moved to `assets/wishlist-icon.css`.
- [x] Checks:
  - `shopify theme check` on the extension: 0 offenses.
  - Shopify validator: all 8 files valid.
  - ESLint passes.
  - Headless jsdom behaviour test: **21/21** (guest, logged-in, merge, rollback, double-click, late-bound blocks). The test harness is in the session scratchpad and isn't committed.
- [ ] Optional / Peter decision #3: an app embed with a header count, and an `/apps/wishlist` storefront page.
- [ ] Test in Horizon 4.x on an **unpublished** theme copy on the dev store: product page, product cards, quick add, search, the DE/FR/ES locales, and a non-EUR market.

### Phase 4 – Customer account extension ✅ code done 2026-11-05
- [x] `api_version = "2026-07"`. That's the newest version Shopify's customer account extension tooling supports today (2026-10 isn't listed yet), and it's supported until July 2027. Uses Preact 10 + `@preact/signals` + `@shopify/ui-extensions` 2026.7.x with Polaris web components. The legacy `extension()` / `createComponent` code and the dead localStorage code are deleted.
- [x] **No app backend:**
  - Reads `$app:wishlist` (+ `compareDigest`) through the **Customer Account API** (`shopify://customer-account/api/2026-10`).
  - Removes with `metafieldsSet` + `compareDigest`, retrying once on `STALE_OBJECT`. Empty lists use `metafieldsDelete`.
  - Capability is now `api_access` instead of `network_access`. The hardcoded Fly URL is gone, so the page works in dev too.
- [x] **Live product data** comes from the **Storefront API** (`shopify.query`) with `@inContext(country, language)`, so price and currency follow the customer's market and titles follow their language. Products that are deleted or unpublished drop out automatically.
- [x] **Page:**
  - Responsive grid (1/2/3 columns via `s-query-container`), image, title, formatted price, and a "Sold out" badge.
  - **Add to cart** shows only for single-variant, in-stock products, as a `/cart/add` link. Multi-variant products show only "View product".
  - "Remove" is optimistic and rolls back with a toast on failure.
  - Loading spinner, error banner with retry, and an empty state.
- [x] **Nav block** (order index): shows the saved-product count with plurals and links via `extension:wishlist-page/`.
- [x] Locales `en / de / fr / es` (German "du"). The template leftover "earnPoints" is gone.
- [x] Checks:
  - GraphQL validated against the Customer Account API 2026-10 and Storefront 2026-07, including `compareDigest` on the input.
  - Components validated for both targets.
  - `shopify app build` passes: page 36 KB, nav 31 KB.
  - Lint, tests and the app build all pass.
- [ ] The `public.wishlist` backend route is now unused by the new extension. **Keep it until the new extension version is deployed**, because the version live today still calls it. Delete it in Phase 7.
- [ ] On the dev store, check that `/cart/add?id=…` adds the item and lands on the cart.
- [ ] Add the **Wishlist menu item** under Admin → Settings → Customer accounts, and add the page in the checkout & accounts editor (the page doesn't load until it's added).
- [ ] Test on desktop and mobile, in DE/FR/ES, and in a GBP market.
- **Note for Phase 5:** removals on the account page now skip the app server, so the server can't send Klaviyo `Removed from Wishlist` events for them. Options:
  - Send only "Added" events and let the Klaviyo flow re-check.
  - Better: subscribe to the **Events API** `Customer` update trigger on `customer.metafield(namespace: '$app', key: 'wishlist')` and send Klaviyo events from that webhook. That covers every write path.

### Phase 5 – Email reminders ✅ code done 2026-11-05 ← the original blocker

**Why it stalled:** the old design expected Flow to "watch the customer metafield", but there was no trigger for that, and tags can't say *which* product was added.

**Decision (2026-11-05): Klaviyo, fed by a Shopify Events API subscription.** It covers every write path, the storefront heart and the account page alike.

How it works:
1. **Subscription:** `[events]` subscription `wishlist-changed` (in both app configs) on `Customer` update with trigger `customer.metafield(namespace: '$app', key: 'wishlist').*`. Its query returns the customer `id`, `defaultEmailAddress` and the current list. Deliveries go to `/events/wishlist`, and the HMAC is checked by `authenticate.webhook`.
2. **Diff:** `app/routes/events.wishlist.jsx` diffs the new list against a `WishlistSnapshot` row (new Prisma model + migration) to get *added* and *removed* products. Deliveries older than the last applied one are ignored, because deliveries can arrive out of order.
3. **Send:** one Klaviyo event per product goes to the Events API (revision **2026-10-15**). The events are `Added to Wishlist` and `Removed from Wishlist`.
   - **Profile:** matched by email, so it merges with the Klaviyo–Shopify integration's profile.
   - **Properties:** `ProductID` (numeric, matches the Klaviyo Shopify catalog), `ProductName`, `URL`, `ImageURL`, `Price`, `Currency`, `WishlistCount` and `ShopifyCustomerID`.
   - **Value:** `value` / `value_currency` are set on adds.
4. **Retries:** `unique_id` = `<delivery id>:<added|removed>:<product>`. Shopify keeps the same delivery ID when it redelivers, so Klaviyo records each event once. A retryable Klaviyo failure (429/5xx/timeout) returns 500 **without** saving the snapshot, so Shopify redelivers. A non-retryable 4xx is logged and skipped.
5. **Guards:**
   - No `KLAVIYO_PRIVATE_KEY` → sending is skipped and logged (dev).
   - No email → skipped.
   - GDPR `customers/redact` and `shop/redact` delete snapshots.
6. Checks:
   - 10 new unit tests (22 total).
   - Signed-delivery smoke test: add/remove diff, duplicate and stale deliveries ignored, cleared list → removals, forged HMAC → 401.

**Peter / to do**
- [x] **Verified on the dev store (2026-11-05, `pnpm dev`, test customer "Test France"):**
  - The Events trigger **does fire for the `$app` metafield** (`app--293485510657.wishlist`), about 1 second after each write.
  - Adding 2 products → 2 events. Removing 1 → 1 event. Deleting the metafield → 1 removal (the `.*` trigger covers deletion). The snapshot ends at `[]`.
  - A write with a stale `compareDigest` is rejected with a real `STALE_OBJECT` error, which the Phase 2/4 retry code relies on, and no delivery follows.
  - The CLI (3.92.1) accepted the `[events]` config, so no CLI update is needed for dev.
  - Test data cleaned up.
  - Also fixed: `shopify.web.toml` `webhooks_path` was restored, because the CLI's dev-start test webhook was 404ing on `/api/webhooks`.
- [ ] **API key:** create a Klaviyo private API key with **only `events:write`**. Set it yourself: `fly secrets set KLAVIYO_PRIVATE_KEY=… -a wishlist-2026-app`, or in local `.env` for dev. Don't paste it in chat.
- [ ] **Account:** confirm which Klaviyo account is EU, and whether UK shares it.
- [ ] **Klaviyo flow:** "Wishlist reminder".
  - **Trigger:** metric *Added to Wishlist*.
  - **Flow filters:**
    - Has not placed order since starting this flow.
    - Has not had *Removed from Wishlist* where ProductID equals the trigger's ProductID since starting the flow.
  - **Steps:** wait 1 day → email 1 (product block from event properties) → wait 6 days → email 2.
  - **Smart sending:** on. It only sends to profiles that can receive email marketing, which handles EU consent.
  - **Optional:** a price-drop / back-in-stock flow on the same metric.
- [ ] **Prices:** product prices in events are in shop currency (EUR). For UK shoppers, use the catalog's localized price in Klaviyo templates, or the `URL` (the product page shows the market price).


### Phase 6 – Hosting ✅ config done 2026-11-05 (the Fly changes themselves are Peter's to run, see `docs/HOSTING.md`)
- [x] `fly.toml`:
  - `primary_region = "lhr"` (closest Fly region to the IE/UK markets).
  - One always-on machine: `auto_stop_machines = "stop"` + `min_machines_running = 1` (that's the combination Fly applies a minimum to).
  - Health check on `GET /healthz`.
  - Volume `snapshot_retention = 14`.
  - Comment: SQLite = exactly one machine.
- [x] `/healthz` route: `SELECT 1` against SQLite, returning 200 `ok` / 503. Responds in about 3 ms locally.
- [x] Dockerfile: Node 24, `--prod=false` install, and **Prisma generated at build time**. `docker-start` now only runs migrations and serves, so there are no engine downloads on boot. `.dockerignore` excludes git/docs/dist/tests/sqlite.
- [x] Checks: Docker isn't installed locally, so I replayed the Dockerfile steps in a clean copy of the repo (`NODE_ENV=production`): install, build, migrate and serve all work, and `/healthz` returns 200.
- [x] `.gitignore` now covers `*.sqlite`, so a downloaded production DB backup can't be committed.
- [x] `docs/HOSTING.md` runbook: back up → `fly volumes fork --region lhr` → `fly machine clone --attach-volume` → retire syd → `fly deploy`. It also covers verification, rollback, cleanup and secrets.
- [ ] **Peter:**
  - `fly auth login`, then run HOSTING.md steps 0–3 (back up, fork, move). These are safe to do before release: same code, new region.
  - Step 4 (`fly deploy` of the new code) only as part of the Phase 7 release.
  - Set `KLAVIYO_PRIVATE_KEY` and the trimmed `SCOPES` with `fly secrets set --stage`.

### Phase 7 – QA & release (1 day)
- [ ] Test matrix: guest add → toast → login → merge; logged-in add/remove; two tabs at once; collection page request count (should be 0 GETs); multi-currency market; the account page in each language.
- [ ] `shopify app deploy` a new version **(ask before running)** → install/update on EU live → add the block to an unpublished theme → publish with the next theme release.
- [ ] Update the README to match the shipped design; delete the outdated docs.

**Estimate:** about 6–8 working days in total.

---

## 5. Decisions needed from Peter
1. **Which stores:** EU only, or EU + UK? This decides whether it stays a custom (single-merchant) app or becomes multi-store custom distribution.
2. ~~**Email reminders:**~~ **Decided: Klaviyo** (2026-11-05). Still open: which Klaviyo account and list handle EU, and does UK use the same account?
3. **Storefront wishlist page and header count:** in scope for v1, or later?
4. **Existing data:** is anyone's wishlist live on the EU store that needs migrating, or only dev-store test data?
