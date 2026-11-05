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

### Phase 1 – Platform upgrade (1–1½ days)
- [ ] Remix → React Router 7 + `@shopify/shopify-app-react-router` (follow Shopify's migration guide; keep flat routes via `@react-router/fs-routes`).
- [ ] `ApiVersion.October26` in `shopify.server.js`; `[webhooks] api_version = "2026-10"`.
- [ ] Node 22 LTS in `engines` + Dockerfile; bump Prisma; regenerate lockfile.
- [ ] Rebuild the admin pages (`app._index`, `app.additional`) in Polaris web components and make them correct: right metafield and live status checks.
- [ ] Trim scopes to `read_customers, write_customers, read_products`.
- [ ] Add the GDPR compliance webhooks (`customers/data_request`, `customers/redact`, `shop/redact`). These are needed for EU even on custom distribution.
- [ ] `pnpm lint` and `pnpm build` pass; `shopify app dev` installs cleanly on the dev store.

### Phase 2 – Data model & server (1 day)
- [ ] Declare `customer.metafields.app.wishlist` (`list.product_reference`) in TOML.
- [ ] Rewrite `wishlist.server.js`: `readWishlist` returns GIDs plus a digest, and `applyWishlistChange(action, ids)` uses `metafieldsSet` + `compareDigest` with one retry. Supported actions are `add / remove / merge`, with a cap (e.g. 100).
- [ ] Have both routes use the shared handler; delete `replace`.
- [ ] Write a one-off migration script that copies `custom.wishlist_products` JSON → `$app.wishlist` GIDs and drops deleted products.
- [ ] Add unit tests for dedupe, cap and merge.

### Phase 3 – Theme app extension (1–1½ days)
- [ ] Render the initial state from Liquid; send only GIDs from the client.
- [ ] Use one shared state promise and a single event bus so every button for a product updates together.
- [ ] Keep the observer always on, or listen to Horizon section-render events.
- [ ] Move all strings to `locales/*.json` for the EU store languages (pull the list from Markets).
- [ ] Add block settings for icon size, colour and placement, plus an optional label.
- [ ] Optional: an app embed with a header count, and an `/apps/wishlist` storefront page.
- [ ] Test in Horizon 4.x on an **unpublished** theme copy: product page, product cards, quick add, search.
- [ ] Run `shopify theme check` on the theme that uses the block.

### Phase 4 – Customer account extension (1 day)
- [ ] Upgrade to `api_version = "2026-10"`, Preact + `@shopify/ui-extensions` 2026.10.x, Polaris web components.
- [ ] Load and remove items through the Customer Account API, show live price and image, add an "Add to cart" link, and delete the localStorage code.
- [ ] Fix the nav block and check the full-page link format for 2026-10.
- [ ] Add locales for all store languages.
- [ ] Add the **Wishlist menu item** under Admin → Settings → Customer accounts.
- [ ] Test on desktop and mobile in the updated single-column customer account layout.

### Phase 5 – Email reminders (1–1½ days, needs a decision) ← the original blocker

**Why it stalled:** the README design expected Flow to "watch the customer metafield". As far as I can tell, Flow has no built-in trigger that fires when a customer metafield changes (to confirm in Flow's trigger list). The metafield writes were happening, but there was nothing to start a workflow. Tags were a workaround, but tags can't carry *which* product was added, so the emails couldn't show it.

**Fix: the app emits the event itself.** The same request that saves the wishlist also sends a named event that includes the customer and product. Nothing has to watch for changes.

**✅ Decision (2026-11-05): Klaviyo (Option A).** Option B is kept below for reference only.

**Option A – Klaviyo (CHOSEN)**
- [ ] Create a Klaviyo private API key with only the **Events: write** scope. Store it as `KLAVIYO_PRIVATE_KEY` in `fly secrets` (and in local `.env` for dev).
- [ ] Add `app/lib/klaviyo.server.js` → `trackWishlistEvent(metric, customer, product)`:
  - `POST https://a.klaviyo.com/api/events` with a pinned `revision` header.
  - Profile: `email` + `external_id` = the Shopify customer ID, so it merges with the profile the Klaviyo–Shopify integration already created.
  - Properties: product ID, handle, title, URL, image, price, currency and market. These are resolved **server-side** from the product GID, so they're correct for the shopper's market.
  - Fire-and-forget: a Klaviyo failure must never fail the wishlist save. Log it and move on.
- [ ] Only send for `add` and `remove`. Don't send on guest `merge`, or a login would send a burst of events. Instead, send one `Added to Wishlist` event per *new* item after a merge.
- [ ] The customer query needs `email`, and `read_customers` scope is enough for that.
- [ ] Klaviyo flow:
  - Trigger: Added to Wishlist.
  - Wait 1 day, then filter: hasn't placed an order with that product since.
  - Email 1 shows the product block.
  - Wait 6 days, then send email 2.
- [ ] Klaviyo already handles consent, smart sending and frequency caps, and has a price-drop/back-in-stock add-on. That avoids building throttling tags in Flow.
- [ ] Also send `Removed from Wishlist` so the flow can exit on removal.

**Option B – Shopify-native (Flow + Shopify Email) — not chosen, reference only**
- [ ] Add a `flow_trigger` extension `wishlist-item-added` with `customer_id`, `product_id` and reference fields.
- [ ] After each `add`, the server calls `flowTriggerReceive` (payload < 50 KB).
- [ ] Workflow:
  - Trigger.
  - Condition: the customer accepts email marketing.
  - Wait 1 day.
  - Condition: the product is still in `$app.wishlist` and hasn't been ordered.
  - Send the Shopify Email marketing automation.
  - Tag `wishlist_reminder_sent` with a date to throttle.
- [ ] Optional: a `flow_trigger_lifecycle_callback` so the app only sends events while a workflow is active.

**Either way**
- [ ] Only send for customers with marketing consent (EU/GDPR). The email is marketing, not transactional.
- [ ] Debounce: one reminder sequence per customer per X days, however many items they add.
- [ ] Test end to end on the dev store with a seeded customer before turning it on in EU live.

### Phase 6 – Hosting (½ day)
- [ ] Move Fly to an EU region (`ams`/`fra`), keep `min_machines_running = 1`, and use a real health check route instead of `/`.
- [ ] Set up nightly SQLite volume snapshots (sessions only, so easy to rebuild, but saves reinstalling).
- [ ] Put secrets in `fly secrets`; make sure `.env` stays out of git (currently it is).

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
