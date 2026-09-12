const currency = new Intl.NumberFormat("es-CO", {
  maximumFractionDigits: 0,
});

const CART_STORAGE_KEY = "noir-urbano-cart";
const cart = new Map();

function hydrateCartFromStorage() {
  try {
    const raw = localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return;

    const parsed = JSON.parse(raw);
    const items = Array.isArray(parsed) ? parsed : Object.values(parsed || {});

    for (const item of items) {
      if (!item?.key || !item?.name || !item?.price || !item?.size) continue;

      cart.set(item.key, {
        ...item,
        quantity: Number(item.quantity) || 1,
      });
    }
  } catch (error) {
    console.warn("No se pudo restaurar el carrito persistido.", error);
  }
}

function saveCart() {
  try {
    const items = [...cart.values()];
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
  } catch (error) {
    console.warn("No se pudo guardar el carrito.", error);
  }
}

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
const paymentStatusTitle = document.querySelector(
  "[data-payment-status-title]",
);
const paymentStatusCopy = document.querySelector("[data-payment-status-copy]");
const paymentStatusClose = document.querySelector("[data-payment-status-close]");
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
  return (
    document
      .querySelector("[data-size-option].is-selected")
      ?.textContent.trim() || "M"
  );
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
  const total = items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  );

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
      `,
    )
    .join("");
}

function buildOrder() {
  const items = [...cart.values()];
  const total = items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  );
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
        `- ${item.name} / Talla ${item.size} / Cantidad ${item.quantity} / ${formatPrice(item.price)}`,
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
  window.open(
    `https://wa.me/${brandContact.whatsapp}?text=${message}`,
    "_blank",
    "noopener,noreferrer",
  );
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
  showPaymentStatus(
    "Redirigiendo a Wompi",
    "Seras enviado al checkout seguro de Wompi.",
  );
  window.location.href = checkoutData.checkoutUrl;
}

const paymentStates = {
  APPROVED: {
    title: "Pago aprobado",
    copy: "Tu pedido fue confirmado correctamente. Gracias por comprar NOIR URBANO.",
    tone: "approved",
  },
  DECLINED: {
    title: "Pago rechazado",
    copy: "El pago fue rechazado. Puedes intentarlo de nuevo o escribirnos por WhatsApp.",
    tone: "declined",
  },
  VOIDED: {
    title: "Pago anulado",
    copy: "La transacción fue anulada y no se realizó el cobro.",
    tone: "voided",
  },
  ERROR: {
    title: "Error en el pago",
    copy: "Wompi reportó un error al procesar el pago. Escríbenos por WhatsApp para ayudarte.",
    tone: "error",
  },
  PENDING: {
    title: "Pago pendiente",
    copy: "El pago sigue en proceso. Estamos esperando confirmación de Wompi.",
    tone: "pending",
  },
};

function showPaymentStatus(title, copy, tone = "pending") {
  paymentStatusTitle.textContent = title;
  paymentStatusCopy.textContent = copy;
  paymentStatus.className = `payment-status payment-status--${tone}`;
  paymentStatus.hidden = false;
}

function clearPaymentStatus() {
  paymentStatus.hidden = true;
}

function clearPaymentParams() {
  const url = new URL(window.location.href);
  url.searchParams.delete("id");
  url.searchParams.delete("transaction_id");
  url.searchParams.delete("pago");
  window.history.replaceState({}, document.title, url);
}

async function checkRedirectPayment() {
  const params = new URLSearchParams(window.location.search);
  const transactionId = params.get("id") || params.get("transaction_id");
  if (!transactionId) return;

  showPaymentStatus(
    "Consultando pago",
    "Estamos verificando la transaccion en Wompi.",
    "pending",
  );

  try {
    const response = await fetch(
      `/api/wompi-transaction?id=${encodeURIComponent(transactionId)}`,
    );
    const payload = await response.json();
    const transaction = payload.data || payload;
    const status = transaction.status || "ERROR";
    const paymentState = paymentStates[status] || paymentStates.ERROR;
    showPaymentStatus(
      paymentState.title,
      paymentState.copy,
      paymentState.tone,
    );

    if (status === "APPROVED") {
      cart.clear();
      saveCart();
      renderCart();
    } else {
      saveCart();
    }
  } catch (error) {
    showPaymentStatus("Error en el pago", "No pudimos consultar Wompi. Escríbenos por WhatsApp para ayudarte.", "error");
  } finally {
    clearPaymentParams();
  }
}

async function startCheckout() {
  const order = buildOrder();

  if (!order.items.length) {
    checkoutNote.textContent =
      "Agrega al menos una pieza antes de finalizar la compra.";
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

  saveCart();
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

  saveCart();
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
    const size =
      button === featuredAddButton
        ? getSelectedSize()
        : button.dataset.size || "M";
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
paymentStatusClose.addEventListener("click", clearPaymentStatus);

const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.16 },
);

document
  .querySelectorAll(".reveal")
  .forEach((element) => observer.observe(element));
hydrateCartFromStorage();
renderCart();
checkRedirectPayment();
