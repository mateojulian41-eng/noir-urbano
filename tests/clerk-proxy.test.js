const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { PassThrough } = require("node:stream");
const proxyHandler = require("../api/clerk-proxy");

function createReq(method, url, body = "", headers = {}) {
  const req = new PassThrough();
  req.method = method;
  req.url = url;
  req.headers = headers;
  process.nextTick(() => req.end(body));
  return req;
}

function createRes() {
  return {
    statusCode: 200,
    headers: {},
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    end(payload) { this.payload = payload; },
  };
}

function configureProxy() {
  process.env.CLERK_FRONTEND_API_URL = "https://frontend-api.clerk.dev";
  process.env.CLERK_PROXY_URL = "https://noir-urbano.vercel.app/__clerk";
  process.env.CLERK_SECRET_KEY = "test-secret-not-output";
}

function upstreamHeaders(values = {}, cookies = []) {
  return {
    get(name) { return values[name.toLowerCase()] || null; },
    getSetCookie() { return cookies; },
  };
}

test("clasifica todas las configuraciones de producción sin exponer valores", () => {
  const valid = {
    CLERK_PROXY_URL: " https://noir-urbano.vercel.app/__clerk/ ",
    CLERK_SECRET_KEY: " test-secret ",
    CLERK_FRONTEND_API_URL: " https://frontend-api.clerk.dev/ ",
  };
  assert.equal(proxyHandler.getConfiguration({}).category, "proxy_url_missing");
  assert.equal(proxyHandler.getConfiguration({ CLERK_PROXY_URL: valid.CLERK_PROXY_URL }).category, "secret_missing");
  assert.equal(proxyHandler.getConfiguration({ CLERK_PROXY_URL: valid.CLERK_PROXY_URL, CLERK_SECRET_KEY: valid.CLERK_SECRET_KEY }).category, "upstream_missing");
  assert.equal(proxyHandler.getConfiguration({ ...valid, CLERK_PROXY_URL: "not-a-url" }).category, "proxy_url_invalid");
  assert.equal(proxyHandler.getConfiguration({ ...valid, CLERK_FRONTEND_API_URL: "https://attacker.example/" }).category, "upstream_invalid");
  assert.equal(proxyHandler.getConfiguration({ ...valid, CLERK_FRONTEND_API_URL: "https://noir-urbano.vercel.app/__clerk/" }).category, "upstream_cycle");
  const configuration = proxyHandler.getConfiguration(valid);
  assert.equal(configuration.category, "configuration_valid");
  assert.equal(configuration.proxyUrl.toString(), "https://noir-urbano.vercel.app/__clerk");
  assert.equal(configuration.upstreamUrl.toString(), "https://frontend-api.clerk.dev/");
  assert.equal(proxyHandler.getConfiguration(null).category, "unknown_configuration");
});

test("la configuración inválida no ejecuta fetch y el diagnóstico solo contiene presencia y categoría", async () => {
  const previous = {
    proxy: process.env.CLERK_PROXY_URL,
    secret: process.env.CLERK_SECRET_KEY,
    upstream: process.env.CLERK_FRONTEND_API_URL,
  };
  process.env.CLERK_PROXY_URL = "";
  process.env.CLERK_SECRET_KEY = "secret-never-logged";
  process.env.CLERK_FRONTEND_API_URL = "https://frontend-api.clerk.dev";
  const originalFetch = global.fetch;
  const originalInfo = console.info;
  let called = false;
  let log;
  global.fetch = async () => { called = true; };
  console.info = (message, value) => { log = { message, value }; };
  try {
    const res = createRes();
    await proxyHandler(createReq("GET", "/__clerk/v1/proxy-health"), res);
    assert.equal(res.statusCode, 503);
    assert.equal(called, false);
    assert.deepEqual(log.value, { category: "proxy_url_missing", proxyUrlPresent: false, secretPresent: true, upstreamPresent: true });
    assert.equal(JSON.stringify(log).includes("secret-never-logged"), false);
  } finally {
    console.info = originalInfo;
    global.fetch = originalFetch;
    if (previous.proxy === undefined) delete process.env.CLERK_PROXY_URL; else process.env.CLERK_PROXY_URL = previous.proxy;
    if (previous.secret === undefined) delete process.env.CLERK_SECRET_KEY; else process.env.CLERK_SECRET_KEY = previous.secret;
    if (previous.upstream === undefined) delete process.env.CLERK_FRONTEND_API_URL; else process.env.CLERK_FRONTEND_API_URL = previous.upstream;
  }
});

test("la configuración válida normaliza espacios y barras finales y ejecuta fetch", async () => {
  const previous = {
    proxy: process.env.CLERK_PROXY_URL,
    secret: process.env.CLERK_SECRET_KEY,
    upstream: process.env.CLERK_FRONTEND_API_URL,
  };
  process.env.CLERK_PROXY_URL = " https://noir-urbano.vercel.app/__clerk/ ";
  process.env.CLERK_SECRET_KEY = " secret-runtime ";
  process.env.CLERK_FRONTEND_API_URL = " https://frontend-api.clerk.dev/ ";
  const originalFetch = global.fetch;
  let called = false;
  global.fetch = async (url) => {
    called = true;
    assert.equal(String(url), "https://frontend-api.clerk.dev/v1/proxy-health");
    return { status: 200, headers: new Headers(), arrayBuffer: async () => Buffer.from("ok") };
  };
  try {
    const res = createRes();
    await proxyHandler(createReq("GET", "/__clerk/v1/proxy-health"), res);
    assert.equal(res.statusCode, 200);
    assert.equal(called, true);
  } finally {
    global.fetch = originalFetch;
    if (previous.proxy === undefined) delete process.env.CLERK_PROXY_URL; else process.env.CLERK_PROXY_URL = previous.proxy;
    if (previous.secret === undefined) delete process.env.CLERK_SECRET_KEY; else process.env.CLERK_SECRET_KEY = previous.secret;
    if (previous.upstream === undefined) delete process.env.CLERK_FRONTEND_API_URL; else process.env.CLERK_FRONTEND_API_URL = previous.upstream;
  }
});

test("proxy Clerk elimina prefijo, conserva query, método, cuerpo y forwarded-for", async () => {
  configureProxy();
  const originalFetch = global.fetch;
  let request;
  global.fetch = async (url, options) => {
    request = { url: String(url), options };
    return { status: 200, headers: new Headers({ "content-type": "application/json" }), arrayBuffer: async () => Buffer.from("{}") };
  };
  try {
    const res = createRes();
    await proxyHandler(createReq("POST", "/__clerk/v1/client?foo=bar", "payload", {
      "content-type": "application/json",
      "x-forwarded-for": "203.0.113.10, 10.0.0.1",
    }), res);
    assert.equal(request.url, "https://frontend-api.clerk.dev/v1/client?foo=bar");
    assert.equal(request.options.method, "POST");
    assert.equal(request.options.headers.get("x-forwarded-for"), "203.0.113.10, 10.0.0.1");
    assert.equal(request.options.headers.get("clerk-proxy-url"), "https://noir-urbano.vercel.app/__clerk");
    assert.equal(request.options.body.toString(), "payload");
    assert.equal(request.options.headers.get("clerk-secret-key"), "test-secret-not-output");
    assert.equal(res.headers["cache-control"], "no-store");
    assert.equal(res.payload.toString(), "{}");
  } finally {
    global.fetch = originalFetch;
  }
});

test("proxy Clerk no sigue destinos arbitrarios y requiere configuración segura", async () => {
  configureProxy();
  const originalFetch = global.fetch;
  let called = false;
  global.fetch = async () => { called = true; };
  const previous = process.env.CLERK_FRONTEND_API_URL;
  process.env.CLERK_FRONTEND_API_URL = "https://attacker.example/redirect";
  try {
    const res = createRes();
    await proxyHandler(createReq("GET", "/__clerk?target=https%3A%2F%2Fattacker.example"), res);
    assert.equal(res.statusCode, 503);
    assert.deepEqual(JSON.parse(res.payload), { error: "Proxy de autenticación no disponible." });
    assert.equal(called, false);
  } finally {
    process.env.CLERK_FRONTEND_API_URL = previous;
    global.fetch = originalFetch;
  }
});

test("proxy Clerk rechaza métodos no permitidos y body demasiado grande", async () => {
  configureProxy();
  const methodRes = createRes();
  await proxyHandler(createReq("TRACE", "/__clerk/client"), methodRes);
  assert.equal(methodRes.statusCode, 405);

  const bodyRes = createRes();
  const originalFetch = global.fetch;
  global.fetch = async () => { throw new Error("must not call upstream"); };
  try {
    await proxyHandler(createReq("POST", "/__clerk/client", "x".repeat(proxyHandler.MAX_BODY_BYTES + 1)), bodyRes);
    assert.equal(bodyRes.statusCode, 413);
    assert.deepEqual(JSON.parse(bodyRes.payload), { error: "Solicitud inválida." });
  } finally {
    global.fetch = originalFetch;
  }
});

test("proxy Clerk sanitiza error upstream y nunca devuelve la secret key", async () => {
  configureProxy();
  const originalFetch = global.fetch;
  global.fetch = async () => { throw new Error("upstream secret details"); };
  try {
    const res = createRes();
    await proxyHandler(createReq("GET", "/__clerk/client"), res);
    assert.equal(res.statusCode, 502);
    assert.deepEqual(JSON.parse(res.payload), { error: "No se pudo conectar con el proveedor de autenticación." });
    assert.equal(res.payload.includes("test-secret-not-output"), false);
  } finally {
    global.fetch = originalFetch;
  }
});

test("proxy y rewrite no afectan las rutas API existentes", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const root = path.join(__dirname, "..");
  const vercel = JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8"));
  assert.deepEqual(vercel.rewrites, [
    { source: "/admin", destination: "/admin.html" },
    { source: "/__clerk", destination: "/api/clerk-proxy" },
    { source: "/__clerk/:path*", destination: "/api/clerk-proxy?clerk_proxy_path=:path*" },
  ]);
  assert.equal(JSON.stringify(vercel).includes("/api/:path*"), false);
});

test("proxy Clerk rechaza upstream igual al proxy, bajo noir-urbano o no HTTPS", async () => {
  configureProxy();
  const originalFetch = global.fetch;
  global.fetch = async () => { throw new Error("must not call upstream"); };
  const candidates = [
    "https://noir-urbano.vercel.app/__clerk",
    "https://noir-urbano.vercel.app",
    "http://frontend-api.clerk.dev",
  ];
  try {
    for (const candidate of candidates) {
      process.env.CLERK_FRONTEND_API_URL = candidate;
      const res = createRes();
      await proxyHandler(createReq("GET", "/__clerk/client"), res);
      assert.equal(res.statusCode, 503);
    }
  } finally {
    global.fetch = originalFetch;
  }
});

test("proxy Clerk resuelve raíz, slash, varios segmentos y la función estática", async () => {
  configureProxy();
  const originalFetch = global.fetch;
  const urls = [];
  global.fetch = async (url) => {
    urls.push(String(url));
    return { status: 200, headers: new Headers(), arrayBuffer: async () => Buffer.from("ok") };
  };
  try {
    for (const requestPath of ["/__clerk", "/__clerk/", "/__clerk/v1/environment", "/__clerk/v1/client/sessions/current"]) {
      await proxyHandler(createReq("GET", requestPath), createRes());
    }
    await proxyHandler(createReq("GET", "/api/clerk-proxy/v1/environment"), createRes());
    assert.deepEqual(urls, [
      "https://frontend-api.clerk.dev/",
      "https://frontend-api.clerk.dev/",
      "https://frontend-api.clerk.dev/v1/environment",
      "https://frontend-api.clerk.dev/v1/client/sessions/current",
      "https://frontend-api.clerk.dev/v1/environment",
    ]);
    assert.equal(fs.existsSync(path.join(__dirname, "..", "api", "__clerk", "[...path].js")), false);
    assert.equal(fs.existsSync(path.join(__dirname, "..", "api", "clerk-proxy.js")), true);
  } finally {
    global.fetch = originalFetch;
  }
});

test("proxy Clerk reenvía HEAD sin cuerpo y OPTIONS sin CORS permisivo", async () => {
  configureProxy();
  const originalFetch = global.fetch;
  const methods = [];
  global.fetch = async (url, options) => {
    methods.push({ url: String(url), method: options.method, body: options.body });
    return { status: 204, headers: new Headers({ "access-control-allow-origin": "https://noir-urbano.vercel.app" }), arrayBuffer: async () => Buffer.from("not returned") };
  };
  try {
    const headRes = createRes();
    await proxyHandler(createReq("HEAD", "/__clerk/v1/environment"), headRes);
    assert.equal(headRes.statusCode, 204);
    assert.equal(headRes.payload, undefined);
    const optionsRes = createRes();
    await proxyHandler(createReq("OPTIONS", "/__clerk/v1/environment"), optionsRes);
    assert.equal(optionsRes.statusCode, 204);
    assert.equal(optionsRes.headers["access-control-allow-origin"], undefined);
    assert.deepEqual(methods.map(({ method, body }) => ({ method, body })), [
      { method: "HEAD", body: undefined },
      { method: "OPTIONS", body: undefined },
    ]);
  } finally {
    global.fetch = originalFetch;
  }
});

test("proxy elimina path y clerk_proxy_path de la query generada por rewrite", async () => {
  configureProxy();
  const originalFetch = global.fetch;
  let request;
  global.fetch = async (url, options) => {
    request = { url: String(url), options };
    return { status: 200, headers: new Headers(), arrayBuffer: async () => Buffer.from("ok") };
  };
  try {
    await proxyHandler(createReq(
      "POST",
      "/api/clerk-proxy?clerk_proxy_path=v1/client/sign_ins&path=v1/client/sign_ins&__clerk_api_version=X&__clerk_js_version=Y&foo=bar",
      "form-body",
      { "content-type": "application/x-www-form-urlencoded" },
    ), createRes());
    assert.equal(request.url, "https://frontend-api.clerk.dev/v1/client/sign_ins?__clerk_api_version=X&__clerk_js_version=Y&foo=bar");
    assert.equal(request.url.includes("path="), false);
    assert.equal(request.url.includes("clerk_proxy_path="), false);
    assert.equal(request.options.method, "POST");
    assert.equal(request.options.body.toString(), "form-body");
  } finally {
    global.fetch = originalFetch;
  }
});

test("proxy conserva query legítima en environment y proxy-health", async () => {
  configureProxy();
  const originalFetch = global.fetch;
  const urls = [];
  global.fetch = async (url) => {
    urls.push(String(url));
    return { status: 200, headers: new Headers(), arrayBuffer: async () => Buffer.from("ok") };
  };
  try {
    await proxyHandler(createReq("GET", "/api/clerk-proxy?clerk_proxy_path=v1/environment&path=v1/environment&__clerk_api_version=X&__clerk_js_version=Y"), createRes());
    await proxyHandler(createReq("GET", "/api/clerk-proxy?clerk_proxy_path=v1/proxy-health&__clerk_api_version=X"), createRes());
    assert.deepEqual(urls, [
      "https://frontend-api.clerk.dev/v1/environment?__clerk_api_version=X&__clerk_js_version=Y",
      "https://frontend-api.clerk.dev/v1/proxy-health?__clerk_api_version=X",
    ]);
  } finally {
    global.fetch = originalFetch;
  }
});

test("proxy preserva múltiples Set-Cookie separados y atributos de seguridad", async () => {
  configureProxy();
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    status: 200,
    headers: upstreamHeaders({
      "content-type": "application/json",
      location: "/continue",
      "content-encoding": "gzip",
      "content-length": "999",
    }, [
      "__session=one; Domain=noir-urbano.vercel.app; Path=/; Secure; HttpOnly; SameSite=Lax",
      "__client=two; Domain=noir-urbano.vercel.app; Path=/; Secure; HttpOnly; SameSite=None",
    ]),
    arrayBuffer: async () => Buffer.from("{}"),
  });
  try {
    const res = createRes();
    await proxyHandler(createReq("GET", "/__clerk/v1/environment"), res);
    assert.deepEqual(res.headers["set-cookie"], [
      "__session=one; Domain=noir-urbano.vercel.app; Path=/; Secure; HttpOnly; SameSite=Lax",
      "__client=two; Domain=noir-urbano.vercel.app; Path=/; Secure; HttpOnly; SameSite=None",
    ]);
    assert.equal(res.headers.location, "/continue");
    assert.equal(res.headers["content-encoding"], "gzip");
    assert.equal(res.headers["content-length"], undefined);
    assert.equal(res.headers["set-cookie"].join(",").includes("__client=two"), true);
  } finally {
    global.fetch = originalFetch;
  }
});

test("proxy conserva una cookie, ausencia de cookies y Cookie entrante sin registrarla", async () => {
  configureProxy();
  const originalFetch = global.fetch;
  const originalInfo = console.info;
  const logs = [];
  const requests = [];
  console.info = (message, value) => logs.push({ message, value });
  global.fetch = async (url, options) => {
    requests.push(options.headers.get("cookie"));
    const cookies = requests.length === 1 ? ["single=value; Path=/; Secure; HttpOnly; SameSite=Strict"] : [];
    return { status: 200, headers: upstreamHeaders({}, cookies), arrayBuffer: async () => Buffer.from("ok") };
  };
  try {
    const first = createRes();
    await proxyHandler(createReq("GET", "/__clerk/v1/client", "", { cookie: "__session=opaque; __client=opaque" }), first);
    const second = createRes();
    await proxyHandler(createReq("POST", "/__clerk/v1/client/attempt_first_factor", "form-body", { cookie: "__session=opaque; __client=opaque", "content-type": "application/x-www-form-urlencoded" }), second);
    assert.deepEqual(first.headers["set-cookie"], ["single=value; Path=/; Secure; HttpOnly; SameSite=Strict"]);
    assert.equal(second.headers["set-cookie"], undefined);
    assert.deepEqual(requests, ["__session=opaque; __client=opaque", "__session=opaque; __client=opaque"]);
    assert.equal(logs.every(({ value }) => !JSON.stringify(value).includes("opaque")), true);
    assert.deepEqual(logs.map(({ value }) => value), [
      { incomingCookiePresent: true, upstreamSetCookieCount: 1 },
      { incomingCookiePresent: true, upstreamSetCookieCount: 0 },
    ]);
  } finally {
    console.info = originalInfo;
    global.fetch = originalFetch;
  }
});

test("proxy preserva body y Cookie en sign_ins y attempt_first_factor", async () => {
  configureProxy();
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url: String(url), method: options.method, body: options.body.toString(), cookie: options.headers.get("cookie") });
    return { status: 200, headers: upstreamHeaders(), arrayBuffer: async () => Buffer.from("{}") };
  };
  try {
    await proxyHandler(createReq("POST", "/__clerk/v1/client/sign_ins?__clerk_api_version=X", "sign-in-body", { cookie: "__session=opaque" }), createRes());
    await proxyHandler(createReq("POST", "/__clerk/v1/client/attempt_first_factor?__clerk_js_version=Y", "factor-body", { cookie: "__session=opaque" }), createRes());
    assert.deepEqual(calls, [
      { url: "https://frontend-api.clerk.dev/v1/client/sign_ins?__clerk_api_version=X", method: "POST", body: "sign-in-body", cookie: "__session=opaque" },
      { url: "https://frontend-api.clerk.dev/v1/client/attempt_first_factor?__clerk_js_version=Y", method: "POST", body: "factor-body", cookie: "__session=opaque" },
    ]);
  } finally {
    global.fetch = originalFetch;
  }
});