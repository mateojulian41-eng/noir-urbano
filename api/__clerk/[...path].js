const ALLOWED_METHODS = new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]);
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const DEFAULT_PROXY_URL = "https://noir-urbano.vercel.app/__clerk";

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

function getFrontendApiUrl() {
  const value = String(process.env.CLERK_FRONTEND_API_URL || "").trim();
  if (!value) return undefined;
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) return undefined;
  if (!/(^|\.)clerk\.(accounts\.dev|com)$/.test(url.hostname)) return undefined;
  return url;
}

function getProxyPath(req) {
  const pathname = new URL(req.url, "https://noir-urbano.vercel.app").pathname;
  const prefixes = ["/__clerk", "/api/__clerk"];
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
  const forwardedFor = req.headers?.["x-forwarded-for"];
  if (typeof forwardedFor === "string" && forwardedFor) headers.set("x-forwarded-for", forwardedFor);
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
  const secretKey = String(process.env.CLERK_SECRET_KEY || "").trim();
  if (!frontendApiUrl || !secretKey) {
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
  headers.set("clerk-proxy-url", String(process.env.CLERK_PROXY_URL || DEFAULT_PROXY_URL));
  headers.set("clerk-secret-key", secretKey);
  headers.delete("host");
  headers.delete("content-length");

  try {
    const upstream = await fetch(upstreamUrl, {
      method: req.method,
      headers,
      body,
      redirect: "manual",
    });
    const responseBody = await upstream.arrayBuffer();
    res.statusCode = upstream.status;
    res.setHeader("Cache-Control", "no-store");
    for (const name of ["content-type", "location", "www-authenticate", "retry-after", "set-cookie"]) {
      const value = upstream.headers.get(name);
      if (value) res.setHeader(name, value);
    }
    res.end(Buffer.from(responseBody));
  } catch {
    sendJson(res, 502, { error: "No se pudo conectar con el proveedor de autenticación." });
  }
};

module.exports.getFrontendApiUrl = getFrontendApiUrl;
module.exports.getProxyPath = getProxyPath;
module.exports.MAX_BODY_BYTES = MAX_BODY_BYTES;
