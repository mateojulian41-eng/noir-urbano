const currency = new Intl.NumberFormat("es-CO", {
  maximumFractionDigits: 0,
});

const cart = new Map();
const loader = document.querySelector("[data-loader]");
const cartDrawer = document.querySelector("[data-cart-drawer]");
const cartItems = document.querySelector("[data-cart-items]");
const cartCount = document.querySelector("[data-cart-count]");
const cartTotal = document.querySelector("[data-cart-total]");
const toggleButtons = document.querySelectorAll("[data-cart-toggle]");
const addButtons = document.querySelectorAll("[data-add-to-cart]");
const sizeOptions = document.querySelectorAll("[data-size-option]");
const featuredAddButton = document.querySelector("[data-featured-add]");
const checkoutButton = document.querySelector("[data-checkout-button]");
const checkoutNote = document.querySelector("[data-checkout-note]");
const paymentStatus = document.querySelector("[data-payment-status]");
const paymentStatusTitle = document.querySelector("[data-payment-status-title]");
const paymentStatusCopy = document.querySelector("[data-payment-status-copy]");
const brandContact = {
  email: "noirurbano1@gmail.com",
  whatsapp: "573135859810",
  instagram: "https://www.instagram.com/noir_urbano/",
  tiktok: "https://www.tiktok.com/@noir.urbano",
};

const wompiConfig = {
  checkoutEndpoint: "/api/wompi-checkout",
  currency: "COP",
  redirectUrl: `${window.location.origin}${window.location.pathname}?pago=wompi`,
};

const formatPrice = (value) => `$${currency.format(value)} COP`;

document.body.classList.add("is-loading");

window.addEventListener("load", () => {
  window.setTimeout(() => {
    loader.classList.add("is-hidden");
    document.body.classList.remove("is-loading");
  }, 450);
});

function getSelectedSize() {
  return document.querySelector("[data-size-option].is-selected")?.textContent.trim() || "M";
}

function openCart() {
  document.body.classList.add("cart-open");
  cartDrawer.classList.add("is-open");
  cartDrawer.setAttribute("aria-hidden", "false");
}

function closeCart() {
  document.body.classList.remove("cart-open");
  cartDrawer.classList.remove("is-open");
  cartDrawer.setAttribute("aria-hidden", "true");
}

function renderCart() {
  const items = [...cart.values()];
  const quantity = items.reduce((sum, item) => sum + item.quantity, 0);
  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  cartCount.textContent = quantity;
  cartTotal.textContent = formatPrice(total);

  if (!items.length) {
    cartItems.innerHTML = '<p class="empty-cart">Tu carrito está vacío.</p>';
    return;
  }

  cartItems.innerHTML = items
    .map(
      (item) => `
        <article class="cart-item">
          <div>
            <h3>${item.name}</h3>
            <p>Talla ${item.size} / ${formatPrice(item.price)}</p>
          </div>
          <div class="quantity-controls" aria-label="Cantidad de ${item.name}">
            <button type="button" data-cart-minus="${item.key}" aria-label="Quitar una unidad de ${item.name}">-</button>
            <span>${item.quantity}</span>
            <button type="button" data-cart-plus="${item.key}" aria-label="Agregar una unidad de ${item.name}">+</button>
          </div>
        </article>
      `
    )
    .join("");
}

function buildOrder() {
  const items = [...cart.values()];
  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const reference = `NOIR-${Date.now().toString(36).toUpperCase()}`;

  return {
    reference,
    currency: wompiConfig.currency,
    amountInCents: total * 100,
    total,
    items: items.map((item) => ({
      name: item.name,
      size: item.size,
      quantity: item.quantity,
      price: item.price,
    })),
  };
}

function buildWhatsAppMessage(order) {
  const productLines = order.items
    .map(
      (item) =>
        `- ${item.name} / Talla ${item.size} / Cantidad ${item.quantity} / ${formatPrice(item.price)}`
    )
    .join("%0A");

  return [
    "Hola NOIR URBANO.",
    "Quiero confirmar este pedido:",
    productLines,
    `Total: ${formatPrice(order.total)}`,
    `Referencia: ${order.reference}`,
  ].join("%0A");
}

function openWhatsAppCheckout(order) {
  const message = buildWhatsAppMessage(order);
  window.open(`https://wa.me/${brandContact.whatsapp}?text=${message}`, "_blank", "noopener,noreferrer");
}

async function requestWompiCheckout(order) {
  const response = await fetch(wompiConfig.checkoutEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(order),
  });

  if (!response.ok) {
    throw new Error("Wompi endpoint is not ready");
  }

  return response.json();
}

function openWompiCheckout(checkoutData) {
  if (checkoutData.checkoutUrl) {
    showPaymentStatus("Redirigiendo a Wompi", "Seras enviado al checkout seguro de Wompi sandbox.");
    window.location.href = checkoutData.checkoutUrl;
    return;
  }

  if (!window.WidgetCheckout) {
    throw new Error("Wompi widget is not available");
  }

  const checkout = new WidgetCheckout({
    currency: checkoutData.currency || wompiConfig.currency,
    amountInCents: checkoutData.amountInCents,
    reference: checkoutData.reference,
    publicKey: checkoutData.publicKey,
    signature: { integrity: checkoutData.signatureIntegrity },
    redirectUrl: checkoutData.redirectUrl || wompiConfig.redirectUrl,
  });

  checkout.open((result) => {
    if (result?.transaction?.id) {
      checkoutNote.textContent = `Transaccion enviada a Wompi: ${result.transaction.id}`;
      showPaymentStatus("Pago enviado", "Wompi esta procesando la transaccion.");
    }
  });
}

function showPaymentStatus(title, copy) {
  paymentStatusTitle.textContent = title;
  paymentStatusCopy.textContent = copy;
  paymentStatus.hidden = false;
}

function paymentStatusCopyFromWompi(status) {
  const statuses = {
    APPROVED: "Pago aprobado. Gracias por comprar NOIR URBANO.",
    DECLINED: "Pago rechazado. Puedes intentar de nuevo o escribirnos por WhatsApp.",
    ERROR: "Wompi reporto un error. Escribenos por WhatsApp para ayudarte.",
    VOIDED: "Pago anulado.",
    PENDING: "Pago pendiente. Estamos esperando confirmacion de Wompi.",
  };

  return statuses[status] || "Transaccion consultada en Wompi.";
}

async function checkRedirectPayment() {
  const params = new URLSearchParams(window.location.search);
  const transactionId = params.get("id") || params.get("transaction_id");
  if (!transactionId) return;

  showPaymentStatus("Consultando pago", "Estamos verificando la transaccion en Wompi.");

  try {
    const response = await fetch(`/api/wompi-transaction?id=${encodeURIComponent(transactionId)}`);
    const payload = await response.json();
    const transaction = payload.data || payload;
    const status = transaction.status || "PENDING";
    showPaymentStatus(`Pago ${status}`, paymentStatusCopyFromWompi(status));
  } catch (error) {
    showPaymentStatus("Pago pendiente", "No pudimos consultar Wompi. Escribenos por WhatsApp.");
  }
}

async function startCheckout() {
  const order = buildOrder();

  if (!order.items.length) {
    checkoutNote.textContent = "Agrega al menos una pieza antes de finalizar la compra.";
    return;
  }

  checkoutButton.disabled = true;
  checkoutButton.textContent = "PREPARANDO PAGO";

  try {
    const checkoutData = await requestWompiCheckout(order);
    openWompiCheckout(checkoutData);
    checkoutNote.textContent = "Pago seguro preparado con Wompi.";
  } catch (error) {
    checkoutNote.textContent =
      "Wompi aun necesita la firma segura del servidor. Te llevamos a WhatsApp para cerrar el pedido.";
    openWhatsAppCheckout(order);
  } finally {
    checkoutButton.disabled = false;
    checkoutButton.textContent = "FINALIZAR COMPRA";
  }
}

function addItem(name, price, size) {
  const key = `${name}-${size}`;
  const existing = cart.get(key);

  cart.set(key, {
    key,
    name,
    price,
    size,
    quantity: existing ? existing.quantity + 1 : 1,
  });

  renderCart();
  openCart();
}

function updateQuantity(key, delta) {
  const item = cart.get(key);
  if (!item) return;

  const nextQuantity = item.quantity + delta;
  if (nextQuantity <= 0) {
    cart.delete(key);
  } else {
    cart.set(key, { ...item, quantity: nextQuantity });
  }

  renderCart();
}

toggleButtons.forEach((button) => {
  button.addEventListener("click", () => {
    if (cartDrawer.classList.contains("is-open")) {
      closeCart();
    } else {
      openCart();
    }
  });
});

addButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const size = button === featuredAddButton ? getSelectedSize() : button.dataset.size || "M";
    addItem(button.dataset.name, Number(button.dataset.price), size);
  });
});

sizeOptions.forEach((button) => {
  button.addEventListener("click", () => {
    sizeOptions.forEach((option) => option.classList.remove("is-selected"));
    button.classList.add("is-selected");
  });
});

cartDrawer.addEventListener("click", (event) => {
  if (event.target === cartDrawer) {
    closeCart();
  }
});

cartItems.addEventListener("click", (event) => {
  const minus = event.target.closest("[data-cart-minus]");
  const plus = event.target.closest("[data-cart-plus]");

  if (minus) updateQuantity(minus.dataset.cartMinus, -1);
  if (plus) updateQuantity(plus.dataset.cartPlus, 1);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && cartDrawer.classList.contains("is-open")) {
    closeCart();
  }
});

checkoutButton.addEventListener("click", startCheckout);

const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.16 }
);

document.querySelectorAll(".reveal").forEach((element) => observer.observe(element));
renderCart();
checkRedirectPayment();
