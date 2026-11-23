import { checkAccess } from "./auth.js";
import { IMPORT_SIZE, READ_SIZE, legacyMatchKey, matchKey, normalizeMatch } from "../client/matches.js";

const headers = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "same-origin",
  "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'self'",
};

const assets = {
  "/": [SITE_HTML, "text/html; charset=utf-8"],
  "/app.css": [SITE_CSS, "text/css; charset=utf-8"],
  "/app.js": [SITE_JS, "text/javascript; charset=utf-8"],
  "/theme.js": [SITE_THEME, "text/javascript; charset=utf-8"],
};

function json(data, status = 200) {
  return Response.json(data, { status, headers });
}

async function listMatches(db, url) {
  const after = Number(url.searchParams.get("after") ?? 0);
  if (!Number.isSafeInteger(after) || after < 0) return json({ error: "Invalid match offset." }, 400);
  const result = await db.prepare(`
    SELECT id, club, match_date AS date, competition, reference, home, away,
      home_score AS homeScore, away_score AS awayScore,
      home_formation AS homeFormation, away_formation AS awayFormation,
      home_xg AS homeXg, away_xg AS awayXg, home_ovr AS homeOvr, away_ovr AS awayOvr
    FROM matches WHERE id > ? ORDER BY id LIMIT ?
  `).bind(after, READ_SIZE + 1).all();
  const matches = result.results.slice(0, READ_SIZE);
  return json({ matches, next: result.results.length > READ_SIZE ? matches.at(-1).id : null });
}

async function importMatches(db, request) {
  if (!request.headers.get("Content-Type")?.includes("application/json")) {
    return json({ error: "Send the match rows as JSON." }, 415);
  }
  const data = await request.text();
  if (data.length > 500_000) return json({ error: "This import batch is too large." }, 413);
  let incoming;
  try {
    incoming = JSON.parse(data);
  } catch {
    return json({ error: "The match rows could not be read." }, 400);
  }
  if (!Array.isArray(incoming?.matches) || !incoming.matches.length || incoming.matches.length > IMPORT_SIZE) {
    return json({ error: "Send between 1 and " + IMPORT_SIZE + " matches per batch." }, 400);
  }
  const rows = [];
  for (const [index, input] of incoming.matches.entries()) {
    try {
      const match = normalizeMatch(input);
      const legacyKey = incoming.source === "html" ? legacyMatchKey(match) : null;
      rows.push({ ...match, importKey: matchKey(match), legacyKey });
    } catch (error) {
      return json({ error: "Row " + (index + 1) + ". " + error.message }, 422);
    }
  }
  const result = await db.prepare(`
    INSERT INTO matches (
      import_key, club, match_date, competition, reference, home, away,
      home_score, away_score, home_formation, away_formation, home_xg, away_xg, home_ovr, away_ovr
    )
    SELECT
      json_extract(value, '$.importKey'), json_extract(value, '$.club'), json_extract(value, '$.date'),
      json_extract(value, '$.competition'), json_extract(value, '$.reference'), json_extract(value, '$.home'),
      json_extract(value, '$.away'), json_extract(value, '$.homeScore'), json_extract(value, '$.awayScore'),
      json_extract(value, '$.homeFormation'), json_extract(value, '$.awayFormation'),
      json_extract(value, '$.homeXg'), json_extract(value, '$.awayXg'),
      json_extract(value, '$.homeOvr'), json_extract(value, '$.awayOvr')
    FROM json_each(?) AS candidate
    WHERE NOT EXISTS (
      SELECT 1 FROM matches AS saved
      WHERE saved.import_key = json_extract(candidate.value, '$.legacyKey')
        AND saved.home_score = json_extract(candidate.value, '$.homeScore')
        AND saved.away_score = json_extract(candidate.value, '$.awayScore')
    )
    ON CONFLICT(import_key) DO NOTHING
  `).bind(JSON.stringify(rows)).run();
  return json({ inserted: result.meta.changes, skipped: rows.length - result.meta.changes }, 201);
}

export default {
  async fetch(request, env) {
    const denied = await checkAccess(request, env.MFL_ADMIN_PASSWORD, headers);
    if (denied) return denied;
    const url = new URL(request.url);
    if (request.method === "GET" && Object.hasOwn(assets, url.pathname)) {
      const [body, contentType] = assets[url.pathname];
      return new Response(body, { headers: { ...headers, "Content-Type": contentType } });
    }
    if (url.pathname === "/favicon.ico") return new Response(null, { status: 204 });
    try {
      if (request.method !== "GET" && ["cross-site", "same-site"].includes(request.headers.get("Sec-Fetch-Site"))) {
        return json({ error: "Open the dashboard directly to change matches." }, 403);
      }
      if (url.pathname === "/api/matches" && request.method === "GET") return await listMatches(env.DB, url);
      if (url.pathname === "/api/matches" && request.method === "POST") return await importMatches(env.DB, request);
      const id = url.pathname.match(/^\/api\/matches\/(\d+)$/)?.[1];
      if (id && request.method === "DELETE" && Number.isSafeInteger(Number(id))) {
        const deleted = await env.DB.prepare("DELETE FROM matches WHERE id = ?").bind(Number(id)).run();
        if (deleted.meta.changes === 0) return json({ error: "This match has already been removed." }, 404);
        return json({ removed: Number(id) });
      }
      return json({ error: "Page or action not found." }, 404);
    } catch (error) {
      console.error("Match database request failed", error.message);
      return json({ error: "The database is temporarily unavailable. Try again in a moment." }, 503);
    }
  },
};
