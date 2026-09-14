const test = require("node:test");
const assert = require("node:assert/strict");
const { PassThrough } = require("node:stream");
const proxyHandler = require("../api/__clerk/[...path]");

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
    { source: "/__clerk/:path*", destination: "/api/__clerk/:path*" },
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