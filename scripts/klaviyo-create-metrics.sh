#!/usr/bin/env bash
# Creates the "Added to Wishlist" and "Removed from Wishlist" metrics in Klaviyo under the
# API source (the same source the app's events use), so the reminder flow can be built
# before the app is live.
#
# Sends two BACKFILL events (recorded, but they can't trigger any flow) to one profile.
#
# Usage:
#   export KLAVIYO_PRIVATE_KEY=pk_...        # key with events:write
#   scripts/klaviyo-create-metrics.sh you@example.com
set -euo pipefail

EMAIL="${1:?usage: $0 <profile email>}"
: "${KLAVIYO_PRIVATE_KEY:?set KLAVIYO_PRIVATE_KEY first}"

# Strip whitespace and terminal bracketed-paste markers that can sneak in when pasting.
KEY=$(printf '%s' "$KLAVIYO_PRIVATE_KEY" | sed -e $'s/\x1b\[20[01]~//g' | tr -d '[:space:]')
case "$KEY" in
  pk_*) echo "Key looks like a private key (pk_…, ${#KEY} chars)." ;;
  *)    echo "This doesn't look like a private key: it should start with pk_ (got ${#KEY} chars starting '${KEY:0:3}')." >&2; exit 1 ;;
esac

send() {
  local metric="$1" uid="$2"
  local code body
  body=$(mktemp)
  code=$(curl -sS -o "$body" -w '%{http_code}' https://a.klaviyo.com/api/events \
    -H "Authorization: Klaviyo-API-Key ${KEY}" \
    -H "revision: 2026-10-15" \
    -H "Content-Type: application/vnd.api+json" \
    -H "Accept: application/vnd.api+json" \
    --data @- <<JSON
{"data":{"type":"event","attributes":{
  "backfill": true,
  "unique_id": "${uid}",
  "metric": {"data":{"type":"metric","attributes":{"name":"${metric}"}}},
  "profile": {"data":{"type":"profile","attributes":{"email":"${EMAIL}"}}},
  "properties": {"ProductID":"8652838437189","ProductName":"Sonic Pro Electric Toothbrush - Pure White",
    "URL":"https://eu.spotlightoralcare.com/products/sonic-pro-pure-white","Source":"Wishlist app (metric setup)"}
}}}
JSON
)
  echo "${metric}: HTTP ${code} (202 = accepted)"
  if [ "$code" != "202" ]; then
    # Klaviyo's error body never contains the key.
    sed -e 's/^/    /' "$body"; echo
  fi
  rm -f "$body"
}

send "Added to Wishlist"     "metric-setup:added"
send "Removed from Wishlist" "metric-setup:removed"
