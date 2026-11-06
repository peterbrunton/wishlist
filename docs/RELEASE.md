# Release checklist – Wishlist 2026 v2.0 (branch `feature/2026-10-upgrade`)

**Target:** EU store `eu.spotlightoralcare.com`
**Production app:** `shopify.app.toml` (Wishlist 2026, client `d75bf…`)
**Backend:** Fly `wishlist-2026-app`

Every step marked 🔴 changes production. Peter runs or approves each one. Nothing here runs automatically.

**Current state (2026-11-05):**
- Active app version is from 2026-03-31. Its extensions call `/apps/wishlist` and `/public/wishlist`, and it stores wishlists in `custom.wishlist_products`.
- **The production Fly app `wishlist-2026-app` is SUSPENDED** (seen 2026-11-06), so the released March version's proxy and account page can't reach a backend. Resume it as part of B.1 (`docs/HOSTING.md`).
- On EU live there is 1 legacy wishlist (Peter's test customer).
- The production theme `[PRODUCTION]` has **no** wishlist block placed, so the release changes nothing on the storefront until the block is added.

---

## A. QA on the dev store (spotlightoralcaredev)

Run it on the **released staging build** (`docs/STAGING.md`, version 2.0.0-staging.1) or on `pnpm dev`. In row 13, staging logs come from `fly logs -a wishlist-2026-dev`.

| # | Check | Expected |
| --- | --- | --- |
| 1 | Admin: open the app | Dashboard shows "Metafield definition found" + the customer count. The setup guide renders. |
| 2 | Theme editor (unpublished Horizon copy): add **Wishlist button** to the product info section and to a product card | Hearts render. Settings (size, colour, label) apply. |
| 3 | Guest: heart a product | Heart fills. Toast "Saved on this device… Log in". **No** network request. |
| 4 | Guest → log in | One `POST /apps/wishlist` (merge). The heart stays filled. localStorage key `wishlist` is cleared. |
| 5 | Logged in: reload a collection page | **0** wishlist requests on load (DevTools → Network). Saved hearts are filled from Liquid. |
| 6 | Logged in: heart / unheart; the same product in two places on a page | Both buttons update together. Double-click sends one request. |
| 7 | Horizon: filter / sort / quick view on a collection | Newly rendered cards get working hearts. |
| 8 | `?locale=de`, `fr`, `es` on the storefront | Button labels and toast are translated. |
| 9 | Customer account → Wishlist page | Grid shows image, title and price. "Remove" works with a toast. The empty state shows after removing all. |
| 10 | Account page in a **GBP** market (UK address / `?country=GB`) | Prices are in GBP. |
| 11 | Account page "Add to cart" on a single-variant product | Lands on the cart with the item added. |
| 12 | Orders page → wishlist block | "You have N saved products" → opens the Wishlist page. |
| 13 | Terminal during 3–9 | `Wishlist events: … skipping N event(s)` for each change (no Klaviyo key in dev). |
| 14 | Optional: set a **test** Klaviyo key in `.env`, heart a product with a test customer | The event shows up on that profile in Klaviyo → Metrics → *Added to Wishlist*. |

Afterwards, run `shopify app dev clean --config dev` to remove the dev preview.

---

## B. Production release (in this order)

**Before you start (lessons from staging, 2026-11-06):**
- Use Shopify CLI **5.x** (`npx @shopify/cli@5.0.1 …` or upgrade the global one). The global 3.92.1 is too old.
- On EU live, check that **no other app holds `/apps/wishlist`**. The theme JS hardcodes that path, and a clash gives `/apps/wishlist-N`. Check Settings → Apps → Wishlist 2026 → App Proxy URL after release, and look for the old "wishlist" apps (`ed31…`, `b2b8…`).
- After release, check that the dashboard says **"Metafield definition found"**. On the dev store, the definition only appeared after a reinstall. On live, **don't reinstall without deciding first**: an uninstall deletes app-owned definitions. The legacy `custom.wishlist_products` data isn't app-owned, so it's unaffected. If the definition is missing, open the app once, then query `metafieldDefinitions(ownerType: CUSTOMER, namespace: "$app")`, and decide with Peter.

1. **Hosting move (can happen days earlier):** `docs/HOSTING.md` steps 0–3. It's the same code in London on a forked volume, and you check it before retiring Sydney.
2. **Secrets (staged, no restart):**
   ```bash
   fly secrets set KLAVIYO_PRIVATE_KEY=pk_xxx SCOPES=read_customers,read_products,write_customers -a wishlist-2026-app --stage
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
