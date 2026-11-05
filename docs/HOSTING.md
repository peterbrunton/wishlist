# Hosting runbook – Wishlist 2026 (Fly.io)

**Production backend:** Fly app `wishlist-2026-app`, served at `https://wishlist-2026-app.fly.dev`. Shopify (EU store) calls it for the app proxy (`/apps/wishlist`), webhooks, Events, and the embedded admin.

| | Before (Mar 2026) | Target |
| --- | --- | --- |
| Region | `syd` (Sydney) | **`lhr`** (London). Closest Fly region to the IE/UK markets; `ams`/`fra` are fine alternatives. |
| Always on | `min_machines_running = 0` (cold start ≈ 27 s) | one machine, never stops |
| Health check | `GET /` (renders the landing page) | `GET /healthz` (server + SQLite) |
| Volume snapshots | default 5 days | 14 days |
| Image | Node 20, Prisma generated at boot | Node 24, Prisma generated at build |

SQLite lives on the `wishlist_data` volume at `/data/prod.sqlite`. It holds **sessions** (the EU store's offline token) and **wishlist snapshots** (for Klaviyo diffs). The wishlists themselves live in Shopify customer metafields, so losing the volume costs a re-auth, not customer data.

> SQLite = **exactly one machine**. Never `fly scale count 2`.

---

## 0. Prerequisites (Peter)

```bash
cd ~/LIVE/apps/wishlist && nvm use
```

```bash
fly auth login
```

```bash
fly status -a wishlist-2026-app && fly volumes list -a wishlist-2026-app && fly secrets list -a wishlist-2026-app
```

Expected secrets: `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SHOPIFY_APP_URL` (= `https://wishlist-2026-app.fly.dev`), `SCOPES`. Add Klaviyo now or later:

```bash
fly secrets set KLAVIYO_PRIVATE_KEY=pk_xxx SCOPES=read_customers,read_products,write_customers -a wishlist-2026-app --stage
```

(`--stage` saves the secrets without restarting; they apply on the next deploy.)

---

## 1. Back up the current volume

```bash
fly volumes snapshots create <SYD_VOLUME_ID> -a wishlist-2026-app
```

Optionally keep a local copy of the database too:

```bash
fly ssh sftp get /data/prod.sqlite ./prod-backup-$(date +%Y%m%d).sqlite -a wishlist-2026-app
```

(The backup file is ignored by git via `*.sqlite`. Delete it once the move is verified.)

## 2. Copy the volume to London

```bash
fly volumes fork <SYD_VOLUME_ID> --region lhr -a wishlist-2026-app
```

This makes an independent copy as of now. Sessions rarely change, so a few minutes of drift doesn't matter.

## 3. Start a London machine on the copy, then retire Sydney

```bash
fly machine list -a wishlist-2026-app
```

```bash
fly machine clone <SYD_MACHINE_ID> --region lhr --attach-volume <LHR_VOLUME_ID>:/data -a wishlist-2026-app
```

Check that London answers before removing Sydney:

```bash
fly machine list -a wishlist-2026-app && curl -sI https://wishlist-2026-app.fly.dev/
```

```bash
fly machine destroy <SYD_MACHINE_ID> --force -a wishlist-2026-app
```

## 4. Deploy the new image (Node 24, `/healthz`, new config)

> ⚠️ This changes production. Only run it once the full release checklist (Phase 7) says go. The new backend must go out **together with** `shopify app deploy`, which creates the `$app:wishlist` definition and Events subscription.

```bash
fly deploy -a wishlist-2026-app
```

Then check:

```bash
curl -s https://wishlist-2026-app.fly.dev/healthz && fly status -a wishlist-2026-app && fly logs -a wishlist-2026-app --no-tail | tail -30
```

`/healthz` should return `ok` in well under a second. `fly status` should show **one** machine in `lhr`, with checks passing.

## 5. Clean up (after a day of normal traffic)

```bash
fly volumes list -a wishlist-2026-app
```

```bash
fly volumes destroy <SYD_VOLUME_ID> -a wishlist-2026-app
```

(Permanent. Only do this once London has run cleanly and the snapshot from step 1 exists.)

---

## If something goes wrong

- **App proxy returns "App not installed" / 401 after the move:** the session didn't come across. Open the app once in the EU store admin (Apps → Wishlist 2026). Token exchange recreates the offline session.
- **Health check failing:** run `fly logs`. Usually `DATABASE_URL` or the volume mount is wrong. Confirm `fly volumes list` shows the `lhr` volume *attached*.
- **Roll back:** `fly machine clone` a machine back onto the Sydney volume (it isn't destroyed until step 5), or redeploy the previous image with `fly releases -a wishlist-2026-app`, then `fly deploy --image <previous image>`.

## Routine

- **Snapshots:** taken daily automatically and kept for 14 days (`snapshot_retention`). List them with `fly volumes snapshots list <VOLUME_ID>`.
- **Secrets:** use `fly secrets list` / `fly secrets set …`. Never commit `.env`.
- **Klaviyo key rotation:** create the new key → `fly secrets set KLAVIYO_PRIVATE_KEY=…` → revoke the old key in Klaviyo.
