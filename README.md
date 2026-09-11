# NOIR URBANO

E-commerce experimental desarrollado para una marca de ropa urbana inspirada en la identidad nocturna y el entorno urbano de Cartagena.

El proyecto ofrece una experiencia de compra moderna, responsive y optimizada para dispositivos móviles, con catálogo de productos, carrito de compras e integración de pagos mediante Wompi.

## Demo

Sitio desplegado en Vercel:

https://noir-urbano.vercel.app

## Características

- Catálogo de productos de edición limitada
- Navegación por tienda y colecciones
- Carrito de compras con gestión de cantidades
- Cálculo automático del total
- Integración con Wompi Web Checkout
- Ambiente Sandbox para pagos de prueba
- Consulta del estado de las transacciones
- Mensajes diferenciados para pagos aprobados, rechazados, pendientes, anulados o con error
- Limpieza automática del carrito después de un pago aprobado
- Protección de credenciales mediante variables de entorno
- Diseño responsive para escritorio y dispositivos móviles
- Botón de contacto mediante WhatsApp
- Despliegue continuo mediante GitHub y Vercel

## Tecnologías

- HTML5
- CSS3
- JavaScript
- Node.js
- API HTTP nativa de Node.js
- Git
- GitHub
- GitHub CLI
- Vercel
- Wompi Web Checkout

## Estructura del proyecto

```text
noir-urbano/
├── api/
│   ├── wompi-checkout.js
│   ├── wompi-transaction.js
│   └── wompi-webhook.js
├── assets/
├── .env.example
├── .gitignore
├── index.html
├── package.json
├── README.md
├── script.js
├── server.js
├── styles.css
└── WOMPI_SETUP.md
