# Guía para agentes — NOIR URBANO

## Arquitectura

Proyecto de ecommerce con frontend estático en HTML, CSS y JavaScript, backend Node.js compatible con Vercel y API en `api/`. La lógica de pedidos está en `domain/orders/`, la persistencia en `repositories/`, las migraciones SQL en `migrations/` y las pruebas en `tests/`.

## Comandos disponibles

- `npm start`: inicia el servidor local.
- `npm run dev`: inicia el servidor en modo desarrollo.
- `npm test`: ejecuta las pruebas con el runner nativo de Node.js.
- `npm run smoke:db`: ejecuta la comprobación de base de datos.
- `npm run check`: valida sintaxis de archivos principales.

## Forma de trabajo

- Realiza cambios pequeños, explicados y verificables.
- Antes de editar, explica el plan y los archivos que resultarán afectados.
- Después de editar, resume el diff y ejecuta únicamente las pruebas relacionadas.
- Responde en español y explica la lógica de las decisiones para fortalecer la autonomía técnica del usuario.
- No inventes resultados ni afirmes que una prueba pasó sin haberla ejecutado.

## Límites de seguridad y autorización

- Nunca leer, mostrar ni modificar `.env` o `.env.local`.
- No modificar Wompi, Clerk, Neon, migraciones, webhooks, producción o Vercel sin autorización explícita.
- No ejecutar pagos, eliminar datos ni usar comandos destructivos.
- No hacer commit, push, merge, Pull Request ni despliegue sin autorización explícita.
