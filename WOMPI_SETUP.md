# Integracion Wompi Sandbox - NOIR URBANO

La integración de Wompi está configurada exclusivamente para Sandbox. No se
procesan pagos reales y este documento no autoriza ni describe una activación
de Production.

## Ejecución local

```bash
npm.cmd install
node server.js
```

Abrir `http://127.0.0.1:4173/`. No uses un servidor estático simple para
probar el checkout: se necesita `/api/wompi-checkout` para crear la firma de
integridad en el servidor.

## Variables de Sandbox

Usa `.env.example` como referencia y crea `.env` localmente. Completa los
valores de Sandbox únicamente en tu entorno local o de despliegue controlado.
Nunca publiques `.env`, llaves, secretos ni valores de prueba con apariencia
real.

## Flujo implementado

- `/api/wompi-checkout`: valida productos, calcula el total, genera la
  referencia y firma la integridad antes de crear el checkout.
- `/api/wompi-transaction?id=...`: consulta una transacción con la llave
  privada del servidor.
- `/api/wompi-webhook`: recibe eventos y valida el checksum con el secreto de
  eventos.

El secreto de integridad, la llave privada y el secreto de eventos permanecen
del lado del servidor. La aplicación valida montos y moneda antes de actualizar
un pedido.

## Despliegue

La aplicación puede desplegarse en Vercel con funciones Node.js serverless,
manteniendo Wompi en Sandbox. Las migraciones de base de datos se aplican
manualmente y deben revisarse antes de cualquier entorno compartido. No se
deben ejecutar migraciones a ciegas contra Production.
