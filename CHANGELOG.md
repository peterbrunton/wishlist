# Changelog

## 2.0.0 – unreleased (branch `feature/2026-10-upgrade`)

- **Platform:** Remix → React Router 7 + `@shopify/shopify-app-react-router`. Admin API 2026-10. Customer account extensions on 2026-07 (Preact + Polaris web components). Node 24.
- **Storage:** app-owned `$app:wishlist` (`list.product_reference`) with compare-and-set writes and server-side product validation. Lazy migration from `custom.wishlist_products`.
- **Storefront:** initial state from Liquid (no requests on load), every button for a product kept in sync, en/de/fr/es, icon/label settings, accessibility fixes.
- **Customer account:** a new page that talks to Shopify directly, with market-correct prices, add to cart, and a count block on the Orders page.
- **Klaviyo:** Added/Removed from Wishlist events via the Shopify Events API.
- **Ops:** separate dev/prod app configs, `/healthz`, Fly `lhr` always-on, GDPR webhooks, trimmed scopes.

## 1.x – Dec 2025 – Mar 2026

- First versions: theme block, app proxy, customer account page, JSON metafield `custom.wishlist_products`.
