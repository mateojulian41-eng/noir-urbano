const ALLOWED_METHODS = new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]);
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const OFFICIAL_FAPI_HOSTS = new Set(["frontend-api.clerk.dev", "frontend-api.clerk.com"]);

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

function normalizeUrl(value) {
  try {
    const url = new URL(value);
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return url;
  } catch {
    return undefined;
  }
}

function getConfiguration(env = process.env) {
  if (!env || typeof env !== "object") {
    return { category: "unknown_configuration", proxyUrlPresent: false, secretPresent: false, upstreamPresent: false };
  }
  const proxyValue = String(env.CLERK_PROXY_URL || "").trim();
  const secretValue = String(env.CLERK_SECRET_KEY || "").trim();
  const upstreamValue = String(env.CLERK_FRONTEND_API_URL || "").trim();
  const presence = {
    proxyUrlPresent: Boolean(proxyValue),
    secretPresent: Boolean(secretValue),
    upstreamPresent: Boolean(upstreamValue),
  };
  if (!presence.proxyUrlPresent) return { category: "proxy_url_missing", ...presence };
  if (!presence.secretPresent) return { category: "secret_missing", ...presence };
  if (!presence.upstreamPresent) return { category: "upstream_missing", ...presence };

  const proxyUrl = normalizeUrl(proxyValue);
  if (!proxyUrl || proxyUrl.protocol !== "https:" || proxyUrl.hostname !== "noir-urbano.vercel.app" || proxyUrl.pathname !== "/__clerk" || proxyUrl.search || proxyUrl.hash || proxyUrl.username || proxyUrl.password || proxyUrl.port) {
    return { category: "proxy_url_invalid", ...presence };
  }

  const upstreamUrl = normalizeUrl(upstreamValue);
  if (upstreamUrl && upstreamUrl.origin === proxyUrl.origin) {
    return { category: "upstream_cycle", ...presence };
  }
  if (!upstreamUrl || upstreamUrl.protocol !== "https:" || upstreamUrl.username || upstreamUrl.password || upstreamUrl.search || upstreamUrl.hash || upstreamUrl.pathname !== "/" || upstreamUrl.port) {
    return { category: "upstream_invalid", ...presence };
  }
  if (upstreamUrl.hostname === "noir-urbano.vercel.app") {
    return { category: "upstream_cycle", ...presence };
  }
  if (!OFFICIAL_FAPI_HOSTS.has(upstreamUrl.hostname) && !upstreamUrl.hostname.endsWith(".clerk.accounts.dev")) {
    return { category: "upstream_invalid", ...presence };
  }
  return { category: "configuration_valid", ...presence, proxyUrl, upstreamUrl, secretValue };
}

function getProxyPath(req) {
  const requestUrl = new URL(req.url, "https://noir-urbano.vercel.app");
  const internalPath = requestUrl.searchParams.get("clerk_proxy_path");
  if (internalPath !== null) {
    const normalizedPath = `/${internalPath.replace(/^\/+/, "")}`;
    return normalizedPath === "/" ? "/" : normalizedPath;
  }
  const pathname = requestUrl.pathname;
  const prefixes = ["/__clerk", "/api/clerk-proxy"];
  const prefix = prefixes.find((candidate) => pathname === candidate || pathname.startsWith(`${candidate}/`));
  return prefix ? pathname.slice(prefix.length) || "/" : "/";
}

function getUpstreamQuery(req) {
  const requestUrl = new URL(req.url, "https://noir-urbano.vercel.app");
  requestUrl.searchParams.delete("clerk_proxy_path");
  requestUrl.searchParams.delete("path");
  return requestUrl.search;
}

function getForwardHeaders(req) {
  const headers = new Headers();
  const blocked = new Set(["host", "content-length", "connection", "keep-alive", "transfer-encoding", "upgrade", "clerk-secret-key", "clerk-proxy-url"]);
  for (const [name, rawValue] of Object.entries(req.headers || {})) {
    const value = Array.isArray(rawValue) ? rawValue.join(", ") : rawValue;
    if (!blocked.has(name.toLowerCase()) && typeof value === "string" && value) headers.set(name, value);
  }
  return headers;
}

function getSetCookieValues(headers) {
  if (typeof headers.getSetCookie === "function") return headers.getSetCookie();
  if (typeof headers.raw === "function") return headers.raw()["set-cookie"] || [];
  return [];
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
  const configuration = getConfiguration();
  if (configuration.category !== "configuration_valid") {
    console.info("[clerk-proxy] configuration", {
      category: configuration.category,
      proxyUrlPresent: configuration.proxyUrlPresent,
      secretPresent: configuration.secretPresent,
      upstreamPresent: configuration.upstreamPresent,
    });
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

  const upstreamUrl = new URL(getProxyPath(req), configuration.upstreamUrl);
  upstreamUrl.search = getUpstreamQuery(req);
  const headers = getForwardHeaders(req);
  headers.set("clerk-proxy-url", configuration.proxyUrl.toString());
  headers.set("clerk-secret-key", configuration.secretValue);

  try {
    const upstream = await fetch(upstreamUrl, {
      method: req.method,
      headers,
      body,
      redirect: "manual",
    });
    const setCookies = getSetCookieValues(upstream.headers);
    console.info("[clerk-proxy] cookie-flow", {
      incomingCookiePresent: Boolean(req.headers?.cookie),
      upstreamSetCookieCount: setCookies.length,
    });
    res.statusCode = upstream.status;
    res.setHeader("Cache-Control", "no-store");
    for (const name of ["content-type", "cache-control", "location", "www-authenticate", "retry-after"]) {
      const value = upstream.headers.get(name);
      if (value) res.setHeader(name, value);
    }
    res.removeHeader?.("content-encoding");
    res.removeHeader?.("content-length");
    res.removeHeader?.("transfer-encoding");
    if (setCookies.length) res.setHeader("Set-Cookie", setCookies);
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

module.exports.getConfiguration = getConfiguration;
module.exports.normalizeUrl = normalizeUrl;
module.exports.getProxyPath = getProxyPath;
module.exports.getUpstreamQuery = getUpstreamQuery;
module.exports.getSetCookieValues = getSetCookieValues;
module.exports.MAX_BODY_BYTES = MAX_BODY_BYTES;
