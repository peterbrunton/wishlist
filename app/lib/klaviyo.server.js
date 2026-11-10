// Minimal Klaviyo Events API client. Private key needs only the events:write scope.
// Set KLAVIYO_PRIVATE_KEY (fly secrets / .env). Without it, sending is skipped (useful in dev).
const ENDPOINT = "https://a.klaviyo.com/api/events";
const REVISION = "2026-10-15";
const TIMEOUT_MS = 4000;

export function klaviyoEnabled() {
  return Boolean(process.env.KLAVIYO_PRIVATE_KEY);
}

/**
 * Sends one event. Klaviyo answers 202 when accepted.
 * @returns {Promise<{ ok: true } | { ok: false, retryable: boolean, status: number | null, detail: string }>}
 */
export async function sendKlaviyoEvent(body) {
  let response;
  try {
    response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Klaviyo-API-Key ${process.env.KLAVIYO_PRIVATE_KEY}`,
        revision: REVISION,
        "Content-Type": "application/vnd.api+json",
        Accept: "application/vnd.api+json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    return { ok: false, retryable: true, status: null, detail: String(err?.message ?? err) };
  }

  if (response.status === 202 || response.ok) return { ok: true };

  const detail = await response.text().catch(() => "");
  // 429 and 5xx are worth retrying (Shopify redelivers when we return 5xx); other 4xx are our bug.
  const retryable = response.status === 429 || response.status >= 500;
  return { ok: false, retryable, status: response.status, detail: detail.slice(0, 500) };
}
