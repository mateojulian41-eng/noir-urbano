# NOIR URBANO

NOIR URBANO es un e-commerce de streetwear premium nacido en Cartagena,
Colombia. La experiencia combina un catálogo visual, carrito de compras y un
flujo de pago integrado con Wompi para ofrecer una tienda responsive y lista
para ejecutarse localmente o desplegarse en Vercel.

## Demo

https://noir-urbano.vercel.app

## Características

- Catálogo de productos del Drop 001.
- Selección de tallas y gestión de cantidades en el carrito.
- Checkout Web de Wompi Sandbox.
- Consulta del estado de una transacción después del retorno del checkout.
- Endpoint webhook para validar eventos de Wompi.
- Interfaz responsive para dispositivos móviles y escritorio.
- Fallback a WhatsApp cuando el checkout no está disponible.
- Servidor local Node.js sin dependencias externas de ejecución.

## Tecnologías

- HTML5.
- CSS3.
- JavaScript para navegador y Node.js.
- API nativa `http` de Node.js.
- API `fetch` y `crypto` de Node.js.
- Wompi Checkout Web y API de transacciones.
- Git y GitHub.
- Vercel.

## Estructura del proyecto

```text
.
├── api/
│   ├── wompi-checkout.js       # Valida pedidos y crea la URL firmada de checkout
│   ├── wompi-transaction.js    # Consulta una transacción en Wompi
│   └── wompi-webhook.js        # Valida eventos recibidos desde Wompi
├── assets/                     # Imágenes y recursos visuales de la tienda
├── .env.example                # Plantilla local de variables de entorno
├── .gitignore                  # Exclusiones, incluido .env
├── index.html                  # Marcado principal de la tienda
├── script.js                   # Carrito, checkout y estado del pago
├── server.js                   # Servidor HTTP local y archivos estáticos
├── styles.css                  # Estilos de la interfaz
├── WOMPI_SETUP.md              # Notas operativas de integración
├── package.json                # Metadatos y scripts del proyecto
└── README.md                   # Documentación del proyecto
```

## Requisitos

- Node.js 18 o superior.
- Una cuenta de Wompi con acceso a Sandbox para probar pagos.
- Credenciales de Sandbox configuradas localmente. No se deben publicar ni
	incluir en el repositorio.

## Ejecución local

Desde la raíz de este proyecto:

```bash
node server.js
```

También están disponibles los scripts equivalentes:

```bash
npm start
npm run dev
```

La tienda queda disponible en:

```text
http://127.0.0.1:4173/
```

No se debe usar un servidor estático simple para probar el checkout, porque la
integración necesita las rutas API del servidor Node.js.

## Configuración segura

Usa `.env.example` como referencia y crea un archivo `.env` local en la raíz
del proyecto:

```text
WOMPI_ENV=sandbox
WOMPI_PUBLIC_KEY=<llave-publica-de-sandbox>
WOMPI_PRIVATE_KEY=<llave-privada-de-sandbox>
WOMPI_EVENTS_SECRET=<secreto-de-eventos-de-sandbox>
WOMPI_INTEGRITY_SECRET=<secreto-de-integridad-de-sandbox>
WOMPI_REDIRECT_URL=http://127.0.0.1:4173/?pago=wompi
```

El archivo `.env` está excluido por `.gitignore`. Las llaves privadas y los
secretos deben permanecer únicamente en el servidor. No copies valores reales
en `index.html`, `script.js`, documentación, capturas ni registros públicos.

## Integración con Wompi Sandbox

La integración usa estos endpoints internos:

- `POST /api/wompi-checkout`: valida los productos recibidos desde el carrito,
	calcula el total, genera una referencia y crea la firma de integridad antes
	de devolver la URL del Checkout Web.
- `GET /api/wompi-transaction?id=...`: consulta el estado de la transacción
	usando la llave privada del servidor.
- `POST /api/wompi-webhook`: recibe eventos de Wompi y verifica su checksum con
	el secreto de eventos.

El secreto de integridad no se expone al navegador. La llave pública puede
formar parte de la URL del checkout, pero las llaves privadas y los secretos
siempre deben procesarse del lado del servidor.

## Flujo de pago

1. El cliente agrega productos y tallas al carrito.
2. `script.js` envía el pedido a `POST /api/wompi-checkout`.
3. El servidor valida los productos, calcula el monto en centavos COP y firma
	 la operación con el secreto de integridad.
4. El navegador redirige al Checkout Web de Wompi Sandbox.
5. Wompi procesa el pago y devuelve al cliente a la URL configurada.
6. La tienda consulta `GET /api/wompi-transaction` con el identificador de la
	 transacción y muestra el estado traducido.
7. Los eventos enviados a `POST /api/wompi-webhook` se verifican antes de
	 aceptar cualquier procesamiento adicional.

## Despliegue en Vercel

El proyecto puede desplegarse en Vercel conectando el repositorio o usando la
CLI de Vercel. En el proyecto de Vercel:

1. Configura las variables de entorno de Wompi para el entorno correspondiente.
2. Usa las credenciales de Sandbox para pruebas y las de producción solo en un
	 despliegue de producción preparado para ello.
3. Cambia `WOMPI_REDIRECT_URL` por una URL HTTPS pública del despliegue.
4. Configura en Wompi la URL pública del webhook si se utilizarán eventos.
5. Verifica el checkout y el retorno de transacciones antes de publicar cambios.

La demo pública actual es:

https://noir-urbano.vercel.app

## Estado actual y tareas pendientes

### Estado actual

- La tienda funciona localmente con `node server.js`.
- El checkout está preparado para Wompi Sandbox.
- El estado del pago se muestra después del retorno de Wompi.
- El carrito se vacía únicamente después de confirmar un pago aprobado.
- `.env` permanece fuera del control de versiones.

### Tareas pendientes

- Completar las variables de Sandbox en el entorno local o de despliegue.
- Configurar y verificar el webhook público en Vercel.
- Probar los estados aprobado, rechazado, anulado, error y pendiente en un
	entorno controlado.
- Definir la persistencia de pedidos y la notificación al cliente.
- Revisar la configuración de producción antes de aceptar pagos reales.

## Autor

Mateo Julián Payares Cárcamo
