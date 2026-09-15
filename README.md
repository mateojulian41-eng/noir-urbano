# NOIR URBANO

## Descripción

NOIR URBANO es una plataforma tecnológica de ecommerce para un proyecto
colaborativo de streetwear en etapa de validación comercial. La aplicación
combina un catálogo demostrativo, carrito, checkout y gestión de pedidos.

## Estado del proyecto

- La plataforma tecnológica es funcional y está desplegada.
- Los cuatro productos actuales son demostrativos.
- El producto físico todavía está en validación.
- Wompi opera exclusivamente en Sandbox.
- No se procesan pagos reales.
- No existe inventario comercial aprobado.

## Demo

La demo pública es [https://noir-urbano.vercel.app](https://noir-urbano.vercel.app).
La ruta `/admin` está protegida y no se proporcionan credenciales.

## Funcionalidades

- Catálogo demostrativo.
- Carrito persistente.
- Checkout Wompi Sandbox.
- Firma de integridad.
- Webhook validado.
- Persistencia de pedidos.
- Seguimiento seguro mediante número y token.
- Panel administrativo protegido.
- Filtros y estados operativos.
- Historial administrativo.
- Autenticación y autorización con Clerk.

## Arquitectura

- **Frontend:** HTML, CSS y JavaScript, con catálogo, carrito y panel
  administrativo separado.
- **API:** funciones Node.js compatibles con Vercel, validaciones del lado del
  servidor y manejo de errores sanitizado.
- **Dominio:** servicios de pedidos, validación, estados y acceso seguro.
- **Persistencia:** repositorios intercambiables en memoria y PostgreSQL sobre
  Neon, con migraciones SQL versionadas.
- **Servicios externos:** Wompi Sandbox, Clerk, Neon PostgreSQL y Vercel.

## Tecnologías

- HTML5.
- CSS3.
- JavaScript para navegador y Node.js.
- APIs nativas `http`, `fetch` y `crypto` de Node.js.
- PostgreSQL sobre Neon.
- Clerk.
- Wompi Checkout Web y API de transacciones en Sandbox.
- Vercel.
- Git y GitHub.
- Node.js Test Runner y npm.

## Seguridad

- Las variables de entorno se mantienen fuera del frontend y del control de
  versiones.
- El servidor calcula y valida los precios a partir del catálogo.
- Las consultas PostgreSQL son parametrizadas.
- El token de seguimiento se guarda como hash SHA-256.
- El webhook de Wompi valida su firma/checksum.
- Clerk gestiona la autenticación.
- La autorización administrativa se verifica en backend mediante User ID.
- Las respuestas y los errores se sanitizan.
- No se exponen secretos en el frontend.

## Estados de pedidos

`payment_status` representa el estado de pago: `PENDING_PAYMENT`, `APPROVED`,
`DECLINED`, `VOIDED` o `ERROR`. El pago puede avanzar desde pendiente hacia un
estado final y se registra la transacción de forma idempotente.

`fulfillment_status` representa la operación: `RECEIVED`, `PREPARING`,
`SHIPPED`, `DELIVERED` o `CANCELLED`. Las transiciones permitidas son:

- `RECEIVED` → `PREPARING` o `CANCELLED`.
- `PREPARING` → `SHIPPED` o `CANCELLED`.
- `SHIPPED` → `DELIVERED`.
- Los estados finales no retroceden.
- Solo pedidos con pago aprobado pueden avanzar a `PREPARING`, `SHIPPED` o
  `DELIVERED`.

## Pruebas y calidad

- 72 pruebas automatizadas aprobadas.
- 0 pruebas fallidas.
- `npm audit --omit=dev`: 0 vulnerabilidades.
- Gitleaks 8.30.1 revisó 55 commits sin detectar fugas.

No se atribuyen certificaciones externas a estos resultados.

## Instalación local

Requiere Node.js 18 o superior. Desde esta carpeta:

```powershell
npm.cmd install
npm.cmd run check
node --test "tests/*.test.js"
npm.cmd audit --omit=dev
```

Para ejecutar el servidor local:

```powershell
node server.js
```

No copies secretos reales a archivos rastreados, capturas, registros o
documentación. Usa `.env.example` como plantilla y conserva `.env` localmente.

## Variables de entorno

Solo se enumeran nombres; los valores deben configurarse fuera del repositorio.

### Wompi

- `WOMPI_ENV`
- `WOMPI_PUBLIC_KEY`
- `WOMPI_PRIVATE_KEY`
- `WOMPI_EVENTS_SECRET`
- `WOMPI_INTEGRITY_SECRET`
- `WOMPI_REDIRECT_URL`

### PostgreSQL

- `DATABASE_URL`

### Clerk

- `CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `CLERK_ADMIN_USER_IDS`

### Proxy

- `CLERK_PROXY_URL`
- `CLERK_FRONTEND_API_URL`

### Configuración de entorno

- `PORT` (opcional para el servidor local).

## Migraciones

Las migraciones SQL versionadas se aplican manualmente. Deben revisarse y
probarse en un entorno controlado; nunca deben ejecutarse a ciegas contra
Production.

## Flujo de desarrollo

`rama` → implementación → pruebas → Pull Request → Preview → merge →
Production.

## Limitaciones actuales

- Los productos son demostrativos.
- El producto físico no está aprobado.
- No hay inventario real.
- No existe logística comercial definitiva.
- Wompi no opera en Production.
- No hay ventas reales confirmadas.

## Uso de inteligencia artificial

El proyecto fue diseñado, dirigido, integrado, probado, documentado y
desplegado por Mateo, con apoyo importante de herramientas de inteligencia
artificial para generación, revisión y depuración de código. Las decisiones,
configuraciones, validaciones y pruebas fueron supervisadas durante el
desarrollo.

## Autor y colaboración

- Mateo: web y tecnología.
- Alonso: marketing.
- Ashtone: diseño y propietario de la plancha.

## Licencia

No se añade una licencia todavía. La elección de licencia requiere el acuerdo
de los tres integrantes.
