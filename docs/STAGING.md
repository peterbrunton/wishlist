# Staging: a released build on the dev store

**Dev app:** `wishlist-2026` (`shopify.app.dev.toml`, client `0e19…`), installed on `spotlightoralcaredev`.
**Backend:** Fly app `wishlist-2026-dev`, config `fly.dev.toml`, https://wishlist-2026-dev.fly.dev

This gives the dev store a **released** version that keeps working without `pnpm dev` running, so the full release order can be rehearsed before production.

None of this touches the live EU store or the production app (`shopify.app.toml` / `wishlist-2026-app`).

## Status

- 2026-11-06: staging created. Fly `wishlist-2026-dev` (machine `8577736a433098`, lhr), secret staged via `shopify app env show`, `/healthz` ok. Dev app version **2.0.0-staging.1** released (active), dev preview cleaned.

## One-time setup

```bash
fly auth login                                    # opens the browser
fly apps create wishlist-2026-dev
fly volumes create wishlist_dev_data --app wishlist-2026-dev --region lhr --size 1 --yes
```

Secret (no copy/paste needed):

```bash
S=$(shopify app env show --config dev 2>/dev/null | sed -n 's/.*SHOPIFY_API_SECRET=//p' | tr -d '[:space:]') && echo "length ${#S}" && fly secrets set SHOPIFY_API_SECRET="$S" -a wishlist-2026-dev --stage; unset S
```

Or copy the dev app's **client secret** from Dev Dashboard → wishlist-2026 → Settings. Set it yourself; don't paste it in chat:

```bash
read -rs "S?wishlist-2026 client secret: " && fly secrets set SHOPIFY_API_SECRET="$S" -a wishlist-2026-dev --stage; unset S
```

Optional: add `KLAVIYO_PRIVATE_KEY` the same way to test real Klaviyo events from the dev store. The EU flow `Tp9N35` is a draft, so nothing would send.

## Each staging release

```bash
fly deploy --config fly.dev.toml                  # backend first
curl https://wishlist-2026-dev.fly.dev/healthz    # → ok
pnpm deploy:dev                                   # = shopify app deploy --config dev (creates + releases a version)
shopify app dev clean --config dev                # if a dev preview is still active, it overrides the release
```

Then, in the dev store admin, open **Apps → wishlist-2026** once. This creates the offline session on the new backend; until then, proxy and event calls have no session. After that, run the QA matrix in `RELEASE.md` §A.

## Notes

- `pnpm dev` still works for local work, but it rewrites the dev app's URLs to a tunnel. Afterwards, run `pnpm deploy:dev` to point the dev app back at staging.
- **Cost:** the machine sleeps when idle (`min_machines_running = 0`), plus a 1 GB volume, so it's a few dollars a month at most. To remove it: `fly apps destroy wishlist-2026-dev`.
- Staging has its own SQLite (sessions + wishlist snapshots). Wishlists themselves live on the customers in Shopify, so nothing is lost if it's rebuilt.
