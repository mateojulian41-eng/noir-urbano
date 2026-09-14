const ALLOWED_METHODS = new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]);
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const DEFAULT_PROXY_URL = "https://noir-urbano.vercel.app/__clerk";
const OFFICIAL_FAPI_HOSTS = new Set(["frontend-api.clerk.dev", "frontend-api.clerk.com"]);

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

function getProxyUrl() {
  const value = String(process.env.CLERK_PROXY_URL || DEFAULT_PROXY_URL).trim();
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "noir-urbano.vercel.app" || url.pathname !== "/__clerk" || url.search || url.hash || url.username || url.password) return undefined;
    return url;
  } catch {
    return undefined;
  }
}

function getFrontendApiUrl() {
  const value = String(process.env.CLERK_FRONTEND_API_URL || "").trim();
  if (!value) return undefined;
  let url;
  try {
    url = new URL(value);
  } catch {
    return undefined;
  }
  const proxyUrl = getProxyUrl();
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/" || url.port) return undefined;
  if (!OFFICIAL_FAPI_HOSTS.has(url.hostname) && !url.hostname.endsWith(".clerk.accounts.dev")) return undefined;
  if (url.hostname === "noir-urbano.vercel.app" || (proxyUrl && url.origin === proxyUrl.origin)) return undefined;
  return url;
}

function getProxyPath(req) {
  const pathname = new URL(req.url, "https://noir-urbano.vercel.app").pathname;
  const prefixes = ["/__clerk", "/api/clerk-proxy"];
  const prefix = prefixes.find((candidate) => pathname === candidate || pathname.startsWith(`${candidate}/`));
  return prefix ? pathname.slice(prefix.length) || "/" : "/";
}

function getForwardHeaders(req) {
  const headers = new Headers();
  const blocked = new Set(["host", "content-length", "connection", "transfer-encoding", "clerk-secret-key", "clerk-proxy-url"]);
  for (const [name, rawValue] of Object.entries(req.headers || {})) {
    const value = Array.isArray(rawValue) ? rawValue.join(", ") : rawValue;
    if (!blocked.has(name.toLowerCase()) && typeof value === "string" && value) headers.set(name, value);
  }
  return headers;
}

async function readBody(req) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return undefined;
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error("body too large"), { statusCode: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!ALLOWED_METHODS.has(req.method)) {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }
  const frontendApiUrl = getFrontendApiUrl();
  const proxyUrl = getProxyUrl();
  const secretKey = String(process.env.CLERK_SECRET_KEY || "").trim();
  if (!frontendApiUrl || !proxyUrl || !secretKey) {
    sendJson(res, 503, { error: "Proxy de autenticación no disponible." });
    return;
  }

  let body;
  try {
    body = await readBody(req);
  } catch (error) {
    sendJson(res, error.statusCode === 413 ? 413 : 400, { error: "Solicitud inválida." });
    return;
  }

  const incomingUrl = new URL(req.url, "https://noir-urbano.vercel.app");
  const upstreamUrl = new URL(getProxyPath(req), frontendApiUrl);
  upstreamUrl.search = incomingUrl.search;
  const headers = getForwardHeaders(req);
  headers.set("clerk-proxy-url", proxyUrl.toString());
  headers.set("clerk-secret-key", secretKey);

  try {
    const upstream = await fetch(upstreamUrl, {
      method: req.method,
      headers,
      body,
      redirect: "manual",
    });
    res.statusCode = upstream.status;
    res.setHeader("Cache-Control", "no-store");
    for (const name of ["content-type", "location", "www-authenticate", "retry-after", "set-cookie"]) {
      const value = upstream.headers.get(name);
      if (value) res.setHeader(name, value);
    }
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    const responseBody = await upstream.arrayBuffer();
    res.end(Buffer.from(responseBody));
  } catch {
    sendJson(res, 502, { error: "No se pudo conectar con el proveedor de autenticación." });
  }
};

module.exports.getFrontendApiUrl = getFrontendApiUrl;
module.exports.getProxyUrl = getProxyUrl;
module.exports.getProxyPath = getProxyPath;
module.exports.MAX_BODY_BYTES = MAX_BODY_BYTES;
