# Release checklist – Wishlist 2026 v2.0 (branch `feature/2026-10-upgrade`)

**Target:** EU store `eu.spotlightoralcare.com`
**Production app:** `shopify.app.toml` (Wishlist 2026, client `d75bf…`)
**Backend:** Fly `wishlist-2026-app`

Every step marked 🔴 changes production. Peter runs or approves each one. Nothing here runs automatically.

**Current state (2026-11-05):**
- Active app version is from 2026-03-31. Its extensions call `/apps/wishlist` and `/public/wishlist`, and it stores wishlists in `custom.wishlist_products`.
- The production Fly app `wishlist-2026-app` was **stopped, not suspended**: it auto-starts on request (25 s cold start from syd, 2026-11-09).
- **B.1 progress (2026-11-09):** snapshot `vs_Klabb8BwAZMQsDP7JjzBM2` taken; volume forked to London `vol_vxmpo11mdedolxz4`; machine cloned to London `e829429c540028` (healthy, same March image, ~0.12 s). Sydney machine `2860062f9d1e18` destroyed by Peter. The Sydney volume `vol_rkg56ogx20x1ww64` stays until HOSTING step 5 (earliest 2026-11-10).
- **B.2 done (2026-11-09):** `KLAVIYO_PRIVATE_KEY` + new `SCOPES` staged by Peter.
- **B.3 done (2026-11-09 11:38 UTC):** Fly release v6, image `deployment-01M701JSQ3JQWW343C2J3Y7Y7G`. `/healthz` ok (0.13 s warm), 1 machine in lhr with its check passing, migration `add_wishlist_snapshot` applied, secrets deployed, no 5xx. Rollback image (v5): `registry.fly.io/wishlist-2026-app:deployment-01KN1QFMF2QQJTE8Q93T6BMEPJ`.
- **B.4 done (2026-11-09 11:41 UTC):** app version **2.0.0** created, **inactive**. Active is still `wishlist-2026-17` (2026-03-31), which is the app rollback target. Review: https://dev.shopify.com/dashboard/129763387/apps/317516316673/versions/1200447291393. Note: CLI 5 rejects `--allow-updates` together with `--no-release`.
- **B.5 done (2026-11-09):** Peter released 2.0.0 from the Dev Dashboard. `app versions list` shows 2.0.0 **active** and `wishlist-2026-17` inactive.
- **B.6 done (2026-11-09):** Peter approved the scope update. `POST /webhooks/app/scopes_update` → 200. The dashboard shows "Metafield definition found" (`$app:wishlist`, list.product_reference) and "0 customers with a wishlist", which is expected: the one legacy list is still in `custom.wishlist_products` and moves on its next write. The live proxy `https://eu.spotlightoralcare.com/apps/wishlist` → `{"ids":[],"wishlist":[]}` from the new backend (no `/apps/wishlist-N` clash).
- **B.7 done (2026-11-09):** Peter added wishlist-page (Apps sidebar), the Wishlist menu item and the wishlist-nav block on Orders (under Rewards Club). The editor preview shows the page empty state and the "Your wishlist / Open wishlist" card. Note: the account page reads `$app:wishlist` only, so Peter's legacy test list (3 items in `custom.wishlist_products`) won't show there until that customer hearts/unhearts once on the storefront (the backend merges it on the next write).
- **2.1.1 released (2026-11-10, production):** theme block Custom text settings (header + Add/Remove text) only visible when "Show text next to the icon" is on (`visible_if`). Editor-only change.
- **Batched price-drop alerts (backend only, no app version change), staging 2026-11-09:** drops are queued per customer (`PendingPriceDrop`) and flushed once a minute; one "Wishlist Price Drop" event per customer `PRICE_DROP_BATCH_MINUTES` (default 10) after their first drop, with `Items[]`, `ItemCount`, `TotalSaving`; top-level fields = biggest saving. Klaviyo flow template `X7BJ9Z` (and source `YewNSX`) now loops `event.Items` and falls back to the single-item layout; render-checked with 1 and 2 items. Staging test (window 1 min): queued 16:52:06, batch sent 16:53:21 (1 item). **Production deployed 2026-11-09 16:55 UTC** (volume snapshot first; Fly release v8; migration `add_pending_price_drop` applied; `/healthz` 200; proxy GET 200; flusher running, no errors). App version unchanged (2.1.0).
- **2.1.0 released (2026-11-09 16:42 UTC, production "Wishlist 2026"): price-drop alerts.** Volume snapshot taken first (vol_vxmpo11mdedolxz4); `fly deploy` = release v7, migration `add_product_price` applied, `/healthz` 200, proxy GET still 200. EU admin Sync: 1 wishlist (0 new), 2 products, 2 prices tracked. Klaviyo flow `XceYvp` set **Live** 2026-11-09 16:44 UTC (email action 124260842 live). Name still starts "DRAFT ·": rename in the Klaviyo UI. Rollback: app 2.0.2 + previous Fly image (the extra table is harmless).
- **2.1.0-staging.1 (dev only, 2026-11-09): wishlist price-drop alerts (list price).** Events API `Product` / `product.variants.price` → `/events/price`; baseline table `ProductPrice`; admin "Sync wishlists and prices" button. Dev-store test: Sync = 1 wishlist, 2 products, 2 baselines; Example T-Shirt S 19.99 → 14.99 logged "Price drop: Example T-Shirt 19.99 -> 14.99 EUR … 1 alert(s)" (staging has no Klaviyo key); back to 19.99 = no alert, baseline reset. Klaviyo: metric **Wishlist Price Drop `Sy3p48`** (API) created 2026-11-09; **draft flow `XceYvp`** "DRAFT · Wishlist price drop (EU)" (https://www.klaviyo.com/flow/XceYvp/edit): trigger Sy3p48 → email straight away (flow template `X7BJ9Z`, copied from `YewNSX`), subject "Price drop: {{ event.ProductName }}", re-entry once per 90 days, smart sending on, filter 0 × Placed Order since flow start. Set Live only after 2.1.0 is on production. Production: deploy backend + app, then click Sync on EU.
- **Full check on EU copy 210850447685 (2026-11-09, after 2.0.2):**
  - Backend: Fly lhr machine healthy, `/healthz` 200, no errors in logs; 2.0.2 active.
  - Klaviyo: both test adds (13:56) arrived as "Added to Wishlist" (metric Y8dTRb) with product, price, EUR, image, URL. Flow Tp9N35 set **Live** 2026-11-09 15:46 UTC (flow + both email actions 123938395 / 123938400 live). Only events after this time trigger it. Duplicate empty draft `TraNbA` (same name, same trigger) left as draft: delete in Klaviyo. Flow name still starts "DRAFT ·": rename in the Klaviyo UI.
  - Theme check: no offences in `account-actions.liquid` / `icon-wishlist.svg`; JSONMissingBlock on app blocks is offline-only noise; de/fr/es MatchingTranslations offences pre-date this work.
  - Hearts: 70 published collections, 645/645 page-1 cards have a heart; search 22/22; product recommendations 4/4 (added in this check to all 5 product templates + search.json); PDP "Add to Wishlist"; header account menu link desktop + mobile.
  - No `/apps/wishlist` request on page load; no console errors; 36 px tap target on mobile.
  - Storefront serves English only (/de, /fr, /es redirect to /), so the English PDP custom text affects no one today.
  - Not covered by the app block (enabled_on excludes page/cart/404): product lists on page.* templates, cart and 404; bundle-journey quiz cards; custom all-products grid.
  - Not tested by me (needs a guest/incognito session or a customer click): guest heart + login merge on EU, add-to-cart from account page (row 11).
- **2.0.2 released (2026-11-09, production "Wishlist 2026"):** on-image hearts line up across a section; "Circle background opacity" setting (default 90 %). Verified on EU copy 210850447685: CDN serves 2.0.2 `wishlist-icon.js`, Toothbrushes 24/24 and home bestsellers hearts all 42 px from the image bottom. Rollback: 2.0.1.
- **2.0.1 released (2026-11-09):** the theme block gets Position (Inline / On product image, bottom right, lifted above swatch overlays) and inline Alignment; the guest toast wraps on mobile. Tested on the dev store as 2.0.1-staging.1/2.
- **B.8 in progress (2026-11-09):** "Copy of [PRODUCTION]" `210850447685` (unpublished). The production block ID is `…/wishlist-icon/019c0fbd-0c4d-7620-a529-066116df7976` (the dev-store ID `019a504a…` is silently dropped on EU). Hearts are on index.json (on image), collection.json main card (on image), product.json (under Buy buttons), and product.personalisation.json (Peter: next to price, in the details header, which is **hidden on mobile**). Checked signed in (read-only): 2.0.1 assets, hearts above the swatches (34 px lift), 0 `/apps/wishlist` requests on load. **Gap:** the other product templates (regular, bundle-personalisation, aa-hydroxyapatite-powder) and ~28 alternate collection templates have no heart yet.
  - Later the same day: hearts were scripted into **all** templates on the copy (only heart blocks changed, checked structurally). That covers the main-collection cards and product-list / preview-product-list cards on 26 collection templates + index (on image), and the PDP under Buy buttons on all 5 product templates (Peter's two personalisation hearts, one in the mobile-hidden header, were moved there). Checked: bundles 35/35, toothbrushes 24/24, teeth-whitening 22/22, electric-toothbrushes 13/13 on image; Water Flosser PDP heart visible on mobile. Shopify dropped stale unused settings (`result_heading_*`, `collection_*`) in collection.bundle-journey on save. **Not covered:** custom Spotlight sections that don't use product cards (e.g. `sp_ap_shop` on /collections/all-products).
  - 2.0.2-staging.1 (dev only): "Circle background opacity" setting (0–100 %, default 90) for the on-image heart.
  - 2.0.2-staging.2/3 (dev only): a 20 s re-check on the account Wishlist page was tried and reverted; the page loads the list once on open (a stale open tab needs a reload). PDP hearts on the EU copy use the custom text "Add to Wishlist" / "Remove from Wishlist" (English on all locales; translate in Translate & Adapt if needed).
  - EU copy 210850447685, header account menu: "Wishlist" button added under Orders/Profile (logged-in only), linking to the customer account Wishlist page `…/account/pages/019c0fbd-0c4d-73a8-8e1e-cc21c12a19c9` with the locale/region params of `routes.account_url`. Theme edits: `snippets/account-actions.liquid` (Horizon base file, marked "Spotlight:"), new `assets/icon-wishlist.svg`, `content.account_wishlist` in en/de/fr/es. Re-apply on Horizon upgrades.
  - 2.0.2-staging.4 (dev only): on-image hearts line up across a section (every card uses the largest swatch lift in its section). Previewed on the EU copy: Toothbrushes grid, 24 hearts all 42 px from the image bottom. Note: `wishlist-icon.js` is 9,992 B against Shopify's 10,000 B app-block JS limit, so any further JS needs trimming or a split file.
- On EU live there is 1 legacy wishlist (Peter's test customer).
- The production theme `[PRODUCTION]` has **no** wishlist block placed, so the release changes nothing on the storefront until the block is added.

---

## A. QA on the dev store (spotlightoralcaredev)

Run it on the **released staging build** (`docs/STAGING.md`, version 2.0.0-staging.9 or later) or on `pnpm dev`. In row 13, staging logs come from `fly logs -a wishlist-2026-dev`.

| # | Check | Expected | Result |
| --- | --- | --- | --- |
| 1 | Admin: open the app | Dashboard shows "Metafield definition found" + the customer count. The setup guide renders. | ✅ 2026-11-06: "Metafield definition found", list.product_reference (after reinstall). |
| 2 | Theme editor (unpublished Horizon copy): add **Wishlist button** to the product info section and to a product card | Hearts render. Settings (size, colour, label) apply. | ✅ 2026-11-09: unpublished "Horizon" (149187756222) blocks re-pointed to the current install (`…/wishlist-icon/019a50e1-43f8-79cb-…`) on product info, collection product cards and home product cards (settings reset to defaults; old ones were from previous installs). Pushed 3 templates only, verified by re-pull. Live dev theme home page also has it. |
| 3 | Guest: heart a product | Heart fills. Toast "Saved on this device… Log in". **No** network request. | ✅ 2026-11-07: fills, label → "Remove from wishlist", guest toast + Log in link, localStorage set, **0** proxy requests. Reload keeps it filled; unheart clears it. |
| 4 | Guest → log in | One `POST /apps/wishlist` (merge). The heart stays filled. localStorage key `wishlist` is cleared. | ✅ 2026-11-09 (Peter, logged in): passed. |
| 5 | Logged in: reload a collection page | **0** wishlist requests on load (DevTools → Network). Saved hearts are filled from Liquid. | ✅ 2026-11-09 (Peter, logged in): passed. |
| 6 | Logged in: heart / unheart; the same product in two places on a page | Both buttons update together. Double-click sends one request. | ✅ 2026-11-09 (Peter, logged in): passed. |
| 7 | Horizon: filter / sort / quick view on a collection | Newly rendered cards get working hearts. | ✅ 2026-11-09 (guest, Horizon 149187756222): 9 cards / 9 hearts. **Sort** (price high→low) and **filter** (price ≤ €20, 9→5 cards) re-render cards without reload. Saved state survives, and new hearts save/unsave. **Quick view** modal has a heart. Saving there also fills the card behind it, and unsaving clears both. Product page heart shows the saved state. 0 `/apps/wishlist` requests throughout. |
| 8 | `?locale=de`, `fr`, `es` on the storefront | Button labels and toast are translated. | ⚠️ Dev store has no de/fr/es languages (`/de` → 404). Locale files checked instead: same keys in every language, none blank or left in English. Theme check: 0 offences. |
| 9 | Customer account → Wishlist page | Grid shows image, title and price. "Remove" works with a toast. The empty state shows after removing all. | ✅ 2026-11-06 (Peter): grid, image/title/price, View/Remove; 4 across desktop / 2 mobile. 2026-11-09 (Peter): Remove on the account page is reflected on the storefront. Re-adding on the storefront shows on the account page after reload. |
| 10 | Account page in a **GBP** market (UK address / `?country=GB`) | Prices are in GBP. | ✅ 2026-11-09 (Peter, logged in): passed. |
| 11 | Account page "Add to cart" on a single-variant product | Lands on the cart with the item added. | ⏳ Not run: dev-store test products all have several options. Check on a single-variant EU product during B.8. |
| 12 | Orders page → wishlist block | "You have N saved products" → opens the Wishlist page. | ✅ 2026-11-09 (Peter, logged in): passed. |
| 13 | Terminal during 3–9 | `Wishlist events: … skipping N event(s)` for each change (no Klaviyo key in dev). | ✅ 2026-11-09: `fly logs -a wishlist-2026-dev` shows `Wishlist events: KLAVIYO_PRIVATE_KEY not set, skipping 2 event(s)` (account-page removals) and `skipping 1 event(s)` after the storefront `POST /apps/wishlist` (re-add). `/events/wishlist` → 200. One health-check failure at 11:05 was the idle machine waking up. |
| 14 | Optional: set a **test** Klaviyo key in `.env`, heart a product with a test customer | The event shows up on that profile in Klaviyo → Metrics → *Added to Wishlist*. | Optional. |

Afterwards, run `shopify app dev clean --config dev` to remove the dev preview.

Also run on 2026-11-07: `pnpm test` (23/23 pass) and `shopify theme check --path extensions/wishlist-theme` (0 offences).

---

## B. Production release (in this order)

**Before you start (lessons from staging, 2026-11-06):**
- Use Shopify CLI **5.x** (`npx @shopify/cli@5.0.1 …` or upgrade the global one). The global 3.92.1 is too old.
- On EU live, check that **no other app holds `/apps/wishlist`**. The theme JS hardcodes that path, and a clash gives `/apps/wishlist-N`. Check Settings → Apps → Wishlist 2026 → App Proxy URL after release, and look for the old "wishlist" apps (`ed31…`, `b2b8…`).
- After release, check that the dashboard says **"Metafield definition found"**. On the dev store, the definition only appeared after a reinstall. On live, **don't reinstall without deciding first**: an uninstall deletes app-owned definitions. The legacy `custom.wishlist_products` data isn't app-owned, so it's unaffected. If the definition is missing, open the app once, then query `metafieldDefinitions(ownerType: CUSTOMER, namespace: "$app")`, and decide with Peter.

1. **Hosting move (can happen days earlier):** `docs/HOSTING.md` steps 0–3. It's the same code in London on a forked volume, and you check it before retiring Sydney.
2. **Secrets (staged, no restart):**
   ```bash
   fly secrets set KLAVIYO_PRIVATE_KEY=pk_xxx SCOPES=customer_read_customers,customer_write_customers,read_customers,read_products,write_customers -a wishlist-2026-app --stage
   ```
3. 🔴 **Backend first:** `fly deploy -a wishlist-2026-app` (HOSTING.md step 4).
   - It stays compatible with the **currently released** extensions. `/public/wishlist` is kept, the legacy `add`/`sync`/`replace` payloads are accepted (`pnpm test` covers this), and responses still include the hydrated `wishlist` array.
   - Existing `custom.wishlist_products` lists are read as a fallback and moved to `$app:wishlist` on the next write.
   - Check: `curl https://wishlist-2026-app.fly.dev/healthz` → `ok`.
4. 🔴 **App version, uploaded but not released:**
   ```bash
   shopify app deploy --config shopify.app.toml --no-release --version 2.0.0 --message "2026-10 upgrade, \$app storage, Klaviyo events"
   ```
   Review the version in the Dev Dashboard. It should list: scopes trimmed, `$app:wishlist` definition, Events subscription `wishlist-changed`, webhooks incl. compliance, and the three extensions.
5. 🔴 **Release it:**
   ```bash
   shopify app release --config shopify.app.toml --version 2.0.0
   ```
6. **EU admin → Apps → Wishlist 2026:** open the app once. This refreshes the offline session (expiring tokens). The dashboard should show the definition found.
7. **Checkout & accounts editor:** add the **Wishlist** page via **Apps sidebar → wishlist-page ⊕** (required; a menu link alone shows "There's a problem loading this page") and the Orders-page wishlist block. Then Settings → Customer accounts → menu → add a **Wishlist** item.
8. **Theme:** on an **unpublished copy** of `[PRODUCTION]`, add the Wishlist button block, run the QA rows 2–8 on live data, then publish with the next planned theme release (Peter).
9. **Klaviyo:** once events show up in Klaviyo (Metrics → *Added to Wishlist*), switch the "Wishlist reminder" flow to Live. See FINISHING-PLAN → Phase 5.

### After release

- [ ] `fly logs -a wishlist-2026-app`: no errors. `/events/wishlist` deliveries are logged.
- [ ] Peter's test customer: heart something. `$app:wishlist` now holds the 3 legacy items plus the new one, all in the right order.
- [ ] Klaviyo: event properties (ProductName, URL, ImageURL, Price) look right in a test email preview.

### Rollback

- **Backend:** `fly releases -a wishlist-2026-app` → `fly deploy --image <previous>`.
- **App:** `shopify app release --config shopify.app.toml --version <previous version>`. The March version is still listed in `shopify app versions list`.
- Wishlists written to `$app:wishlist` in between stay on the customer. The March code won't see them, but nothing is lost.

---

## C. Follow-up cleanup (next release, after B is stable)

- [ ] Delete `app/routes/public.wishlist.jsx`. The new account page doesn't call it, and the March extension version is gone after release.
- [ ] Drop the hydrated `wishlist` array from `/apps/wishlist` responses once no cached old theme JS can be around (wait about 1 week).
- [ ] Remove the legacy `custom.wishlist_products` fallback from `readWishlist`.
- [ ] 🔴 Delete the legacy `custom.wishlist_products` metafield definition and value on EU live (ask first).
- [ ] 🔴 Delete the Sydney volume (HOSTING.md step 5).
- [ ] Dev Dashboard: delete the two unused "wishlist" apps (`ed31…`, `b2b8…`).
- [ ] Optional (Peter's decision #3): header count via the `wishlist:change` event, and an `/apps/wishlist` storefront page.
