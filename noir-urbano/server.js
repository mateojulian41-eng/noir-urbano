const fs = require("fs");
const fsp = require("fs/promises");
const http = require("http");
const path = require("path");

const checkoutHandler = require("./api/wompi-checkout");
const transactionHandler = require("./api/wompi-transaction");
const webhookHandler = require("./api/wompi-webhook");

const root = __dirname;
const port = Number(process.env.PORT || 4173);
const host = "127.0.0.1";
const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function loadEnv() {
  const envPath = path.join(root, ".env");
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;

    const separator = trimmed.indexOf("=");
    if (separator === -1) return;

    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  });
}

function sendJson(res, statusCode, data) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(data));
}

function runApi(handler, req, res) {
  Promise.resolve(handler(req, res)).catch((error) => {
    sendJson(res, 500, { error: error.message || "Error interno" });
  });
}

async function serveStatic(req, res) {
  let pathname = decodeURIComponent(new URL(req.url, `http://${host}`).pathname);

  if (pathname === "/__mobile") {
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(`<!doctype html><html><head><title>Mobile Preview</title><style>body{margin:0;background:#111;display:grid;place-items:start center;min-height:100vh;padding:24px}.phone{width:390px;height:844px;border:1px solid #444;background:#000;overflow:hidden}iframe{width:390px;height:844px;border:0}</style></head><body><div class="phone"><iframe src="/"></iframe></div></body></html>`);
    return;
  }

  if (pathname === "/") pathname = "/index.html";

  const file = path.resolve(root, `.${pathname}`);
  if (!file.startsWith(root)) {
    res.statusCode = 403;
    res.end("Forbidden");
    return;
  }

  try {
    const data = await fsp.readFile(file);
    res.statusCode = 200;
    res.setHeader("Content-Type", mimeTypes[path.extname(file)] || "application/octet-stream");
    res.end(data);
  } catch (error) {
    res.statusCode = 404;
    res.end("Not found");
  }
}

loadEnv();

const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, `http://${host}`).pathname;

  if (pathname === "/api/wompi-checkout") {
    runApi(checkoutHandler, req, res);
    return;
  }

  if (pathname === "/api/wompi-transaction") {
    runApi(transactionHandler, req, res);
    return;
  }

  if (pathname === "/api/wompi-webhook") {
    runApi(webhookHandler, req, res);
    return;
  }

  serveStatic(req, res);
});

server.listen(port, host, () => {
  console.log(`NOIR URBANO listo en http://${host}:${port}/`);
  console.log(`Wompi: ${process.env.WOMPI_ENV || "sandbox"} / ${process.env.WOMPI_PUBLIC_KEY ? "llave publica cargada" : "sin llave publica"}`);
});
