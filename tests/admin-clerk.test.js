const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { PassThrough } = require("node:stream");
const adminConfigHandler = require("../api/admin-config");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "admin.html"), "utf8");
const script = fs.readFileSync(path.join(root, "admin.js"), "utf8");
const vercel = JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8"));

function createRes() {
  return { statusCode: 200, headers: {}, setHeader(name, value) { this.headers[name] = value; }, end(payload) { this.payload = payload; } };
}

test("Clerk no se carga antes de obtener la configuración", () => {
  assert.equal(html.includes("clerk.browser.js"), false);
  assert.match(script, /fetch\("\/api\/admin-config"/);
  assert.match(script, /await import\(CLERK_BROWSER_MODULE\)/);
  assert.ok(script.indexOf("fetch(\"/api/admin-config\"") < script.indexOf("await import(CLERK_BROWSER_MODULE)"));
});

test("configuración sin publishableKey produce un error seguro", () => {
  assert.match(script, /La configuración de acceso no es válida/);
  assert.match(script, /No se pudo cargar la configuración de acceso/);
});

test("los controles están bloqueados durante la carga y se habilitan después de Clerk", () => {
  assert.match(html, /id="sign-in"[^>]+disabled/);
  assert.match(html, /id="sign-out"[^>]+hidden disabled/);
  assert.match(script, /setAuthControls\(\{ loading: true/);
  assert.match(script, /await clerk\.load\(\)/);
  assert.match(script, /clerkReady = true/);
  assert.match(script, /clerk\.openSignIn\(\)/);
});

test("la sesión controla visibilidad y no usa almacenamiento del navegador", () => {
  assert.match(script, /signInButton\.hidden = loading \|\| authenticated/);
  assert.match(script, /signOutButton\.hidden = loading \|\| !authenticated/);
  assert.equal(script.includes("localStorage"), false);
  assert.equal(script.includes("sessionStorage"), false);
});

test("admin-config solo devuelve publishableKey", async () => {
  const previous = process.env.CLERK_PUBLISHABLE_KEY;
  process.env.CLERK_PUBLISHABLE_KEY = "pk_test_placeholder";
  const res = createRes();
  const req = new PassThrough();
  req.method = "GET";
  await adminConfigHandler(req, res);
  const payload = JSON.parse(res.payload);
  assert.deepEqual(Object.keys(payload), ["publishableKey"]);
  assert.equal(payload.publishableKey, "pk_test_placeholder");
  if (previous === undefined) delete process.env.CLERK_PUBLISHABLE_KEY;
  else process.env.CLERK_PUBLISHABLE_KEY = previous;
});

test("rewrite limpia /admin hacia admin.html y no usa catch-all", () => {
  assert.deepEqual(vercel.rewrites, [{ source: "/admin", destination: "/admin.html" }]);
  assert.equal(JSON.stringify(vercel).includes("catch-all"), false);
});
