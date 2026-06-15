// Serverless proxy for the WHO ICD-11 API.
//
// The WHO API is free but credentialed (OAuth2 client-credentials), and the
// client_secret must never reach the browser — so this function holds it in
// the WHO_CLIENT_ID / WHO_CLIENT_SECRET env vars on Vercel and does the token
// exchange + search server-side. The browser only ever sees cleaned results.
//
//   GET /api/icd11            -> { ok, hasCreds }   (availability probe)
//   GET /api/icd11?q=diabetes -> { results: [{ code, name }, ...] }
//
// Token (~1h) and the latest release id are cached in module scope and reused
// across warm invocations.

const TOKEN_URL = "https://icdaccessmanagement.who.int/connect/token";
const API_BASE = "https://id.who.int";

let cachedToken = null;       // { value, exp }
let cachedRelease = null;     // e.g. "2024-01"

async function getToken() {
  const id = process.env.WHO_CLIENT_ID;
  const secret = process.env.WHO_CLIENT_SECRET;
  if (!id || !secret) throw new Error("nocreds");
  if (cachedToken && Date.now() < cachedToken.exp) return cachedToken.value;

  const body = new URLSearchParams({
    client_id: id,
    client_secret: secret,
    scope: "icdapi_access",
    grant_type: "client_credentials"
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString()
  });
  if (!res.ok) throw new Error("token " + res.status);
  const data = await res.json();
  // refresh a minute early to avoid edge-of-expiry failures
  cachedToken = { value: data.access_token, exp: Date.now() + ((data.expires_in || 3600) - 60) * 1000 };
  return cachedToken.value;
}

function whoHeaders(token) {
  return {
    Authorization: "Bearer " + token,
    Accept: "application/json",
    "Accept-Language": "en",
    "API-Version": "v2"
  };
}

async function getRelease(token) {
  if (process.env.WHO_ICD_RELEASE) return process.env.WHO_ICD_RELEASE;
  if (cachedRelease) return cachedRelease;
  try {
    const res = await fetch(API_BASE + "/icd/release/11/mms", { headers: whoHeaders(token) });
    if (res.ok) {
      const data = await res.json();
      // releaseId, or parse it out of the latestRelease URI
      const id = data.releaseId ||
        (data.latestRelease && String(data.latestRelease).split("/release/11/")[1] || "").split("/")[0];
      if (id) { cachedRelease = id; return id; }
    }
  } catch (e) { /* fall through to default */ }
  cachedRelease = "2024-01";
  return cachedRelease;
}

// strip WHO's <em class='found'>…</em> highlight tags and decode the few
// entities they emit, so the client gets a plain condition name
function cleanTitle(t) {
  return String(t || "")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .trim();
}

module.exports = async function handler(req, res) {
  const hasCreds = Boolean(process.env.WHO_CLIENT_ID && process.env.WHO_CLIENT_SECRET);
  const q = req.query && (req.query.q || req.query.terms);

  if (!q) {
    return res.status(200).json({ ok: true, hasCreds });
  }
  if (!hasCreds) {
    return res.status(503).json({ error: "nocreds" });
  }

  try {
    const token = await getToken();
    const release = await getRelease(token);
    const url = API_BASE + "/icd/release/11/" + encodeURIComponent(release) +
      "/mms/search?q=" + encodeURIComponent(q) +
      "&flatResults=true&highlightingEnabled=false&useFlexisearch=true";
    const upstream = await fetch(url, { headers: whoHeaders(token) });
    if (!upstream.ok) return res.status(502).json({ error: "search " + upstream.status });
    const data = await upstream.json();

    const seen = {};
    const results = (data.destinationEntities || [])
      .map(function (e) { return { code: e.theCode || "", name: cleanTitle(e.title) }; })
      .filter(function (c) {
        if (!c.name) return false;
        const k = c.name.toLowerCase();
        if (seen[k]) return false;
        seen[k] = 1;
        return true;
      })
      .slice(0, 7);

    // brief edge cache: identical autocomplete queries are common
    res.setHeader("Cache-Control", "s-maxage=86400, stale-while-revalidate");
    return res.status(200).json({ results });
  } catch (e) {
    const code = e && e.message === "nocreds" ? 503 : 502;
    return res.status(code).json({ error: (e && e.message) || "upstream unreachable" });
  }
};
