# Integracion Wompi - NOIR URBANO

La web ya tiene el frontend preparado para crear una transaccion firmada y
redirigir al checkout seguro de Wompi desde el boton `FINALIZAR COMPRA`.
El proyecto esta configurado para sandbox usando `.env`.

## Correr local

```bash
node server.js
```

Abrir:

```text
http://127.0.0.1:4173/
```

No usen un servidor estatico simple para probar Wompi, porque se necesita el
endpoint `/api/wompi-checkout` para crear la firma de integridad.

## Lo que falta para activar pagos reales

1. Entrar al dashboard de Wompi.
2. Ir a la seccion de desarrolladores / llaves.
3. Copiar las llaves de produccion.
4. Cambiar `WOMPI_ENV=production`.
5. Configurar estas variables en el hosting:

```bash
WOMPI_ENV=production
WOMPI_PUBLIC_KEY=pub_prod_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
WOMPI_PRIVATE_KEY=prv_prod_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
WOMPI_EVENTS_SECRET=prod_events_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
WOMPI_INTEGRITY_SECRET=prod_integrity_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
WOMPI_REDIRECT_URL=https://tudominio.com/?pago=wompi
```

## Seguridad

El secreto de integridad nunca debe ponerse en `index.html`, `script.js` ni en
ningun archivo que vea el navegador. Por eso el archivo
`api/wompi-checkout.js` calcula la firma en servidor.

La llave privada y el secreto de eventos tambien deben vivir solo en servidor.
El archivo `.env` esta en `.gitignore` y no se debe subir al repositorio.

## Flujo actual

- `/api/wompi-checkout`: valida productos, calcula total, genera referencia,
  firma de integridad y URL segura de checkout Wompi.
- `/api/wompi-transaction?id=...`: consulta una transaccion usando la llave
  privada.
- `/api/wompi-webhook`: recibe eventos de Wompi y verifica el checksum con el
  secreto de eventos.

## Recomendacion de despliegue

Para usar `api/wompi-checkout.js` sin cambiar mucho el proyecto, desplieguen en
Vercel o en un hosting que soporte funciones Node.js serverless.
