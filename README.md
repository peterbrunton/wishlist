# Wishlist 2026

Custom wishlist app for Spotlight Oral Care (EU store). Shoppers save products with a heart on the storefront and manage them in their customer account. Each change becomes a Klaviyo event that drives reminder emails.

## How it works

| Piece | Where | What it does |
| --- | --- | --- |
| Storage | Customer metafield **`$app:wishlist`** (`list.product_reference`, app-owned, declared in `shopify.app.toml`) | The only source of truth. It holds product IDs, not snapshots, so price, currency and images are always live for the shopper's market. Max 100 items. |
| Storefront heart | `extensions/wishlist-theme` (theme app extension block) | The initial state is rendered in Liquid from the metafield, so there are no requests on page load. Guests save to `localStorage`, which merges into their account on login. Writes go to the app proxy. Strings are in en/de/fr/es. |
| App proxy | `app/routes/apps.wishlist.jsx` → `/apps/wishlist` | Trusts only Shopify's signed `logged_in_customer_id`. It validates that products are ACTIVE, then writes with `metafieldsSet` + `compareDigest` (safe with concurrent tabs and devices). |
| Account page | `extensions/customer-account-ui-extension` (Preact + Polaris) | Full Wishlist page plus an Orders-page block. Reads and removes through the **Customer Account API** and loads products via the **Storefront API** `@inContext`. It doesn't use the app backend. |
| Klaviyo | `[events]` subscription → `app/routes/events.wishlist.jsx` | Shopify's Events API reports every `$app:wishlist` change. The app diffs it against a `WishlistSnapshot` row and sends **Added to Wishlist** / **Removed from Wishlist** events (idempotent `unique_id`). |
| Admin | `app/routes/app._index.jsx`, `app.additional.jsx` | Dashboard (definition status, customer count) and setup guide. |

Code map: pure logic in `app/lib/wishlist-core.js` and `app/lib/wishlist-events-core.js` (unit-tested with `pnpm test`). Admin API calls in `app/lib/wishlist.server.js`; the Klaviyo client in `app/lib/klaviyo.server.js`.

**Stack:** React Router 7 + `@shopify/shopify-app-react-router`, Admin API **2026-10**, customer account extensions **2026-07**, Prisma/SQLite on Fly.io (`lhr`), Node 24.

## Development

| Config | App | Store | Use |
| --- | --- | --- | --- |
| `shopify.app.dev.toml` | wishlist-2026 (dev) | spotlightoralcaredev | `pnpm dev` |
| `shopify.app.toml` | Wishlist 2026 (production) | eu.spotlightoralcare.com | `pnpm deploy`, only with sign-off |

```bash
nvm use          # Node 24 (.nvmrc)
pnpm install
pnpm dev         # shopify app dev --config dev
```

Never run `shopify app dev` against `shopify.app.toml`. It's the live app.

### Environment

| Variable | Where | Purpose |
| --- | --- | --- |
| `KLAVIYO_PRIVATE_KEY` | `fly secrets` (prod), `.env` (dev, optional) | Klaviyo key with **events:write** only. If it's unset, wishlist events are logged and skipped. |
| `DATABASE_URL` | `fly.toml` / `.env` | SQLite: sessions + wishlist snapshots |

### Klaviyo events

Shopify's Events API calls `/events/wishlist` whenever a customer's `$app:wishlist` changes. The app sends **Added to Wishlist** / **Removed from Wishlist** events (one per product) to Klaviyo. See `docs/FINISHING-PLAN.md` → Phase 5 for the properties and the suggested reminder flow.

## Commands

| Command | |
| --- | --- |
| `pnpm dev` | `shopify app dev` against the **dev** app/store |
| `pnpm test` | Unit tests (`node:test`) |
| `pnpm lint` / `pnpm build` | ESLint / production build |
| `pnpm deploy` | 🔴 Production app version (see `docs/RELEASE.md`, ask first) |

## Docs

- `docs/FINISHING-PLAN.md`: the 2026 audit and phase-by-phase log
- `docs/RELEASE.md`: QA matrix, release order, rollback, cleanup
- `docs/HOSTING.md`: Fly.io region move, deploy, backups, secrets
