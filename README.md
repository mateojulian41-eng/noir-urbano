# NOIR URBANO

Streetwear premium. Cartagena, Colombia.

## Estructura

```
noir-urbano/
├── index.html          # Frontend
├── script.js           # Lógica del carrito y Wompi
├── styles.css          # Estilos
├── server.js           # Servidor local (solo para desarrollo)
├── vercel.json         # Configuración de Vercel
├── package.json
├── .env                # Variables de entorno (NO subir a Git)
├── .env.example        # Plantilla de variables
├── api/
│   ├── wompi-checkout.js    # POST /api/wompi-checkout
│   ├── wompi-transaction.js # GET  /api/wompi-transaction?id=...
│   └── wompi-webhook.js     # POST /api/wompi-webhook
└── assets/
    ├── hero-model.jpg
    ├── cartagena-night.jpg
    ├── black-fabric.jpg
    ├── product-heat-tank.jpg
    ├── product-void-cargo.jpg
    └── product-dark-line.jpg
```

## Correr local

```bash
node server.js
# Abre http://127.0.0.1:4173/
```

## Desplegar en Vercel

### 1. Subir a GitHub

```bash
git init
git add .
git commit -m "feat: noir urbano inicial"
git remote add origin https://github.com/mateojulian41-eng/noir-urbano.git
git push -u origin main
```

### 2. Conectar con Vercel

1. Ir a https://vercel.com
2. New Project → importar el repo `noir-urbano`
3. Framework: **Other** (no Next.js, no Vite)
4. Root directory: `/` (raíz)
5. Build command: dejar **vacío**
6. Output directory: dejar **vacío**
7. Click **Deploy**

### 3. Agregar variables de entorno en Vercel

En el dashboard del proyecto → **Settings → Environment Variables**:

| Variable | Valor |
|---|---|
| `WOMPI_ENV` | `sandbox` (o `production`) |
| `WOMPI_PUBLIC_KEY` | Tu llave pública de Wompi |
| `WOMPI_PRIVATE_KEY` | Tu llave privada de Wompi |
| `WOMPI_EVENTS_SECRET` | Tu secreto de eventos Wompi |
| `WOMPI_INTEGRITY_SECRET` | Tu secreto de integridad Wompi |
| `WOMPI_REDIRECT_URL` | `https://TU-DOMINIO.vercel.app/?pago=wompi` |

Después de agregar las variables → **Redeploy**.

### 4. Configurar webhook en Wompi (sandbox)

1. Ir al dashboard de Wompi sandbox
2. Desarrolladores → Webhooks
3. URL: `https://TU-DOMINIO.vercel.app/api/wompi-webhook`
4. Eventos: `transaction.updated`

## Pasar a producción

1. En el dashboard de Wompi, ir a llaves de **producción**
2. Cambiar todas las variables en Vercel a los valores de producción
3. Cambiar `WOMPI_ENV=production`
4. Redeploy

## Imágenes

Las imágenes deben estar en la carpeta `assets/`. Los nombres que espera el HTML:

- `assets/hero-model.jpg`
- `assets/cartagena-night.jpg`
- `assets/black-fabric.jpg`
- `assets/product-heat-tank.jpg`
- `assets/product-void-cargo.jpg`
- `assets/product-dark-line.jpg`
EOF