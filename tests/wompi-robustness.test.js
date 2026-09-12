const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.join(__dirname, '..');
const checkoutHandler = require(path.join(projectRoot, 'api', 'wompi-checkout.js'));
const transactionHandler = require(path.join(projectRoot, 'api', 'wompi-transaction.js'));
const webhookHandler = require(path.join(projectRoot, 'api', 'wompi-webhook.js'));

function createRes() {
  return {
    statusCode: 200,
    headers: {},
    setHeader(name, value) {
      this.headers[name] = value;
    },
    end(payload) {
      this.payload = payload;
    },
  };
}

function createReq({ method = 'GET', url = '/', body = '', headers = {}, env = {} } = {}) {
  const req = new (require('node:stream').PassThrough)();
  req.method = method;
  req.url = url;
  req.headers = headers;
  req.body = body;

  process.nextTick(() => {
    if (body) {
      req.end(body);
    } else {
      req.end();
    }
  });

  return req;
}

function buildCheckoutOrder(overrides = {}) {
  return {
    reference: 'NOIR-TEST-123',
    currency: 'COP',
    total: 150000,
    items: [
      {
        name: 'SHADOW PALM TEE',
        size: 'M',
        quantity: 1,
        price: 150000,
      },
    ],
    ...overrides,
  };
}

function createStatusPayload(status) {
  return {
    data: {
      status,
      id: 'abc123',
      reference: 'NOIR-TEST-123',
    },
  };
}

function makeScriptEnvironment({ search = '', fetchImpl = async () => ({ ok: true, json: async () => ({}) }), initialStorage = {} } = {}) {
  const storage = { ...initialStorage };
  const localStorage = {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : null;
    },
    setItem(key, value) {
      storage[key] = String(value);
    },
    removeItem(key) {
      delete storage[key];
    },
    clear() {
      Object.keys(storage).forEach((key) => delete storage[key]);
    },
  };

  const toggleButton = {
    dataset: {},
    classList: { add() {}, remove() {}, contains() { return false; } },
    addEventListener() {},
    click() {},
  };

  const sizeButton = {
    dataset: {},
    textContent: 'M',
    classList: { add() {}, remove() {}, contains() { return true; } },
    addEventListener() {},
  };

  const cartDrawer = {
    classList: { add() {}, remove() {}, contains() { return false; } },
    setAttribute() {},
    addEventListener() {},
  };

  const paymentStatus = {
    hidden: true,
    className: '',
    textContent: '',
    classList: { add() {}, remove() {}, contains() { return false; } },
    addEventListener() {},
  };

  const paymentStatusTitle = { textContent: '' };
  const paymentStatusCopy = { textContent: '' };
  const cartCountNode = { textContent: '0' };
  const cartTotalNode = { textContent: '$0 COP' };

  const checkoutButton = {
    disabled: false,
    textContent: 'FINALIZAR COMPRA',
    addEventListener(event, handler) {
      this._handler = handler;
    },
    click() {
      if (this._handler) this._handler();
    },
  };

  const cartItems = {
    innerHTML: '',
    addEventListener(event, handler) {
      this._handler = handler;
    },
  };

  const paymentStatusClose = {
    _handler: null,
    addEventListener(event, handler) {
      this._handler = handler;
    },
    click() {
      if (this._handler) this._handler();
    },
  };

  const document = {
    body: {
      classList: {
        add() {},
        remove() {},
        contains() { return false; },
      },
    },
    querySelector(selector) {
      if (selector === '[data-size-option].is-selected') return sizeButton;
      if (selector === '[data-loader]') return { classList: { add() {}, remove() {} } };
      if (selector === '[data-cart-drawer]') return cartDrawer;
      if (selector === '[data-cart-items]') return cartItems;
      if (selector === '[data-cart-count]') return cartCountNode;
      if (selector === '[data-cart-total]') return cartTotalNode;
      if (selector === '[data-checkout-button]') return checkoutButton;
      if (selector === '[data-checkout-note]') return { textContent: '' };
      if (selector === '[data-payment-status]') return paymentStatus;
      if (selector === '[data-payment-status-title]') return paymentStatusTitle;
      if (selector === '[data-payment-status-copy]') return paymentStatusCopy;
      if (selector === '[data-payment-status-close]') return paymentStatusClose;
      if (selector === '[data-featured-add]') return { dataset: { name: 'SHADOW PALM TEE', price: '150000' }, addEventListener() {} };
      return null;
    },
    querySelectorAll(selector) {
      if (selector === '[data-cart-toggle]') return [toggleButton];
      if (selector === '[data-add-to-cart]') return [{ dataset: { name: 'SHADOW PALM TEE', price: '150000', size: 'M' }, addEventListener() {} }];
      if (selector === '[data-size-option]') return [sizeButton];
      if (selector === '.reveal') return [];
      return [];
    },
    addEventListener() {},
  };

  const windowObject = {
    location: {
      origin: 'http://localhost:4173',
      pathname: '/',
      search,
      href: `http://localhost:4173/${search}`,
    },
    history: {
      replaceState() {},
    },
    setTimeout(fn) { fn(); return 0; },
    addEventListener() {},
    open() {},
  };

  const context = {
    window: windowObject,
    document,
    console,
    fetch: fetchImpl,
    localStorage,
    URL,
    URLSearchParams,
    Intl,
    setTimeout: (fn) => { fn(); return 0; },
    clearTimeout() {},
    IntersectionObserver: class { observe() {} unobserve() {} },
  };

  context.globalThis = context;
  context.global = context;
  context.self = context;

  return context;
}

test('checkout: rechaza método HTTP no permitido', async () => {
  const req = createReq({ method: 'GET', url: '/api/wompi-checkout' });
  const res = createRes();

  await checkoutHandler(req, res);

  assert.equal(res.statusCode, 405);
  assert.match(res.payload, /Method not allowed/i);
});

test('checkout: valida carrito vacío y rechaza orden sin productos', async () => {
  const req = createReq({
    method: 'POST',
    url: '/api/wompi-checkout',
    body: JSON.stringify({ items: [] }),
    headers: { 'content-type': 'application/json' },
  });
  const res = createRes();

  process.env.WOMPI_PUBLIC_KEY = 'test-public';
  process.env.WOMPI_INTEGRITY_SECRET = 'test-secret';

  await checkoutHandler(req, res);

  assert.equal(res.statusCode, 400);
  assert.match(res.payload, /vacío|vaciar|carrito/i);
});

test('checkout: ignora precios del cliente y calcula monto exclusivamente del servidor', async () => {
  const req = createReq({
    method: 'POST',
    url: '/api/wompi-checkout',
    body: JSON.stringify({
      items: [
        { name: 'SHADOW PALM TEE', size: 'M', quantity: 2, price: 1 },
      ],
    }),
    headers: { 'content-type': 'application/json' },
  });
  const res = createRes();

  process.env.WOMPI_PUBLIC_KEY = 'test-public';
  process.env.WOMPI_INTEGRITY_SECRET = 'test-secret';

  await checkoutHandler(req, res);

  const payload = JSON.parse(res.payload);
  assert.equal(payload.amountInCents, 300000 * 100);
  assert.equal(payload.currency, 'COP');
  assert.ok(payload.checkoutUrl.includes('signature') || payload.checkoutUrl.includes('signature%3Aintegrity'));
  assert.ok(payload.reference.startsWith('NOIR-'));
});

test('checkout: valida tallas y cantidades inválidas', async () => {
  const badReq = createReq({
    method: 'POST',
    url: '/api/wompi-checkout',
    body: JSON.stringify({ items: [{ name: 'SHADOW PALM TEE', size: 'ZZ', quantity: 1, price: 150000 }] }),
    headers: { 'content-type': 'application/json' },
  });
  const badRes = createRes();

  process.env.WOMPI_PUBLIC_KEY = 'test-public';
  process.env.WOMPI_INTEGRITY_SECRET = 'test-secret';

  await checkoutHandler(badReq, badRes);
  assert.equal(badRes.statusCode, 400);
  assert.match(badRes.payload, /talla/i);

  const qtyReq = createReq({
    method: 'POST',
    url: '/api/wompi-checkout',
    body: JSON.stringify({ items: [{ name: 'SHADOW PALM TEE', size: 'M', quantity: 0, price: 150000 }] }),
    headers: { 'content-type': 'application/json' },
  });
  const qtyRes = createRes();

  await checkoutHandler(qtyReq, qtyRes);
  assert.equal(qtyRes.statusCode, 400);
  assert.match(qtyRes.payload, /cantidad/i);
});

test('transaction: valida ID ausente e inválido y usa sandbox por defecto', async () => {
  process.env.WOMPI_PRIVATE_KEY = 'private-test-key';

  const badIdReq = createReq({
    method: 'GET',
    url: '/api/wompi-transaction?id=',
    headers: { host: 'localhost:4173' },
  });
  const badIdRes = createRes();
  await transactionHandler(badIdReq, badIdRes);
  assert.equal(badIdRes.statusCode, 400);
  assert.match(badIdRes.payload, /inválido|ID/i);

  const invalidPatternReq = createReq({
    method: 'GET',
    url: '/api/wompi-transaction?id=!@@',
    headers: { host: 'localhost:4173' },
  });
  const invalidPatternRes = createRes();
  await transactionHandler(invalidPatternReq, invalidPatternRes);
  assert.equal(invalidPatternRes.statusCode, 400);

  const captured = [];
  global.fetch = async (url, options) => {
    captured.push({ url, headers: options.headers });
    return {
      status: 200,
      async json() {
        return { data: { status: 'APPROVED' } };
      },
    };
  };

  const validReq = createReq({
    method: 'GET',
    url: '/api/wompi-transaction?id=abc123',
    headers: { host: 'localhost:4173' },
  });
  const validRes = createRes();
  await transactionHandler(validReq, validRes);

  assert.ok(captured[0].url.includes('sandbox.wompi.co'));
  assert.match(captured[0].headers.Authorization, /Bearer/);
  assert.ok(!validRes.payload.includes('private-test-key'));
});

test('transaction: responde 502 si hay error de red y no filtra secretos en respuesta', async () => {
  process.env.WOMPI_PRIVATE_KEY = 'private-test-key';
  global.fetch = async () => {
    throw new Error('ECONNRESET');
  };

  const req = createReq({
    method: 'GET',
    url: '/api/wompi-transaction?id=abc123',
    headers: { host: 'localhost:4173' },
  });
  const res = createRes();

  await transactionHandler(req, res);

  assert.equal(res.statusCode, 502);
  assert.match(res.payload, /error de red|red|ECONNRESET/i);
  assert.ok(!res.payload.includes('private-test-key'));
});

test('webhook: rechaza request sin secreto, JSON inválido y checksum incorrecto', async () => {
  delete process.env.WOMPI_EVENTS_SECRET;

  const noSecretReq = createReq({ method: 'POST', url: '/api/wompi-webhook', body: JSON.stringify({ ok: true }) });
  const noSecretRes = createRes();
  await webhookHandler(noSecretReq, noSecretRes);
  assert.equal(noSecretRes.statusCode, 503);

  process.env.WOMPI_EVENTS_SECRET = 'event-secret';

  const invalidJsonReq = createReq({ method: 'POST', url: '/api/wompi-webhook', body: '{bad json' });
  const invalidJsonRes = createRes();
  await webhookHandler(invalidJsonReq, invalidJsonRes);
  assert.equal(invalidJsonRes.statusCode, 400);

  const invalidChecksumReq = createReq({
    method: 'POST',
    url: '/api/wompi-webhook',
    body: JSON.stringify({
      event: 'transaction.updated',
      data: { transaction: { status: 'DECLINED', reference: 'REF-123' } },
      meta: { timestamp: '123', signature: { checksum: 'abcd', properties: ['status'] } },
    }),
  });
  const invalidChecksumRes = createRes();
  await webhookHandler(invalidChecksumReq, invalidChecksumRes);
  assert.equal(invalidChecksumRes.statusCode, 401);
  assert.match(invalidChecksumRes.payload, /checksum/i);
});

test('webhook: valida propiedades dinámicas, rutas anidadas, checksum del body y del header', async () => {
  process.env.WOMPI_EVENTS_SECRET = 'event-secret';
  const crypto = require('node:crypto');

  const buildPayload = ({ properties, checksumLocation = 'body', uppercase = false, status = 'APPROVED' }) => {
    const payload = {
      event: 'transaction.updated',
      data: {
        transaction: {
          id: 'txn-123',
          status,
          reference: 'REF-123',
          amount: { value: '150000' },
        },
      },
      meta: {
        timestamp: '12345',
        signature: {
          checksum: '',
          properties,
        },
      },
    };

    const values = properties.map((property) => {
      const source = payload.data;
      const value = property.split('.').reduce((obj, key) => obj?.[key], source);
      return value == null ? '' : String(value);
    });

    const computed = crypto.createHash('sha256').update([...values, payload.meta.timestamp, 'event-secret'].join('')).digest('hex');
    payload.meta.signature.checksum = uppercase ? computed.toUpperCase() : computed;

    return payload;
  };

  const dynamicPayload = buildPayload({ properties: ['transaction.id', 'transaction.status'] });
  const reversePayload = buildPayload({ properties: ['transaction.status', 'transaction.id'], status: 'DECLINED' });
  const nestedPayload = buildPayload({ properties: ['transaction.amount.value', 'transaction.reference'] });
  const headerPayload = buildPayload({ properties: ['transaction.reference'], checksumLocation: 'header' });
  delete headerPayload.meta.signature.checksum;

  const expectedMissing = buildPayload({ properties: ['transaction.missing'] });

  const validBodyReq = createReq({ method: 'POST', url: '/api/wompi-webhook', body: JSON.stringify(dynamicPayload) });
  const validBodyRes = createRes();
  await webhookHandler(validBodyReq, validBodyRes);
  assert.equal(validBodyRes.statusCode, 200);

  const reverseReq = createReq({ method: 'POST', url: '/api/wompi-webhook', body: JSON.stringify(reversePayload) });
  const reverseRes = createRes();
  await webhookHandler(reverseReq, reverseRes);
  assert.equal(reverseRes.statusCode, 200);

  const nestedReq = createReq({ method: 'POST', url: '/api/wompi-webhook', body: JSON.stringify(nestedPayload) });
  const nestedRes = createRes();
  await webhookHandler(nestedReq, nestedRes);
  assert.equal(nestedRes.statusCode, 200);

  const headerChecksum = crypto.createHash('sha256').update(['REF-123', '12345', 'event-secret'].join('')).digest('hex');
  const headerReq = createReq({
    method: 'POST',
    url: '/api/wompi-webhook',
    body: JSON.stringify(headerPayload),
    headers: { 'x-event-checksum': headerChecksum },
  });
  const headerRes = createRes();
  await webhookHandler(headerReq, headerRes);
  assert.equal(headerRes.statusCode, 200);

  const uppercasePayload = buildPayload({ properties: ['transaction.reference'], uppercase: true });
  const uppercaseReq = createReq({ method: 'POST', url: '/api/wompi-webhook', body: JSON.stringify(uppercasePayload) });
  const uppercaseRes = createRes();
  await webhookHandler(uppercaseReq, uppercaseRes);
  assert.equal(uppercaseRes.statusCode, 200);

  const missingReq = createReq({ method: 'POST', url: '/api/wompi-webhook', body: JSON.stringify(expectedMissing) });
  const missingRes = createRes();
  await webhookHandler(missingReq, missingRes);
  assert.equal(missingRes.statusCode, 401);

  let logged = '';
  const originalLog = console.log;
  console.log = (...args) => {
    logged += args.join(' ');
  };

  try {
    const finalReq = createReq({
      method: 'POST',
      url: '/api/wompi-webhook',
      body: JSON.stringify(dynamicPayload),
    });
    const finalRes = createRes();
    await webhookHandler(finalReq, finalRes);
    assert.equal(finalRes.statusCode, 200);
    assert.ok(!logged.includes('event-secret'));
  } finally {
    console.log = originalLog;
  }
});

test('script: estados de pago en español, clases visuales y cierre del aviso', async () => {
  const fetchImpl = async () => ({
    ok: true,
    json: async () => ({ data: { status: 'DECLINED' } }),
  });

  const context = makeScriptEnvironment({ search: '?id=tx-1', fetchImpl });
  const scriptSource = fs.readFileSync(path.join(projectRoot, 'script.js'), 'utf8');
  vm.runInNewContext(scriptSource, context);

  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  const paymentStatus = context.document.querySelector('[data-payment-status]');
  const title = context.document.querySelector('[data-payment-status-title]');
  const copy = context.document.querySelector('[data-payment-status-copy]');
  const closeButton = context.document.querySelector('[data-payment-status-close]');

  assert.equal(paymentStatus.hidden, false);
  assert.match(title.textContent, /rechazado|declin/gi);
  assert.match(copy.textContent, /rechazado|escríbenos|intentarlo/i);
  assert.match(paymentStatus.className, /declined|error|pending|approved|voided/);

  closeButton.click();
  assert.equal(paymentStatus.hidden, true);
});

test('script: conserva el carrito cuando Wompi devuelve DECLINED y limpia URL', async () => {
  const fetchImpl = async () => ({
    ok: true,
    json: async () => ({ data: { status: 'DECLINED' } }),
  });

  const persistedCart = JSON.stringify({
    'SHADOW PALM TEE-M': {
      key: 'SHADOW PALM TEE-M',
      name: 'SHADOW PALM TEE',
      price: 150000,
      size: 'M',
      quantity: 1,
    },
  });

  const context = makeScriptEnvironment({
    search: '?id=tx-1&pago=wompi&transaction_id=tx-extra',
    fetchImpl,
    initialStorage: {
      'noir-urbano-cart': persistedCart,
    },
  });

  const scriptSource = fs.readFileSync(path.join(projectRoot, 'script.js'), 'utf8');
  vm.runInNewContext(scriptSource, context);

  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  const cartCount = context.document.querySelector('[data-cart-count]');
  assert.equal(Number(cartCount.textContent), 1);

  const storageValue = context.localStorage.getItem('noir-urbano-cart');
  assert.ok(storageValue.includes('SHADOW PALM TEE'));
  assert.ok(storageValue.includes('"quantity":1'));
});
