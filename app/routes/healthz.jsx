// Fly health check. Cheap on purpose: proves the server is up and SQLite is reachable.
import db from "../db.server";

export const loader = async () => {
  try {
    await db.$queryRaw`SELECT 1`;
    return new Response("ok", { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("Health check failed", err);
    return new Response("db unavailable", { status: 503 });
  }
};
