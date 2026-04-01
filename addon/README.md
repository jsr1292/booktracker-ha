# Book Tracker Home Assistant Addon

Personal book tracking library with barcode scanning and reading statistics.

## Características / Features

- 📚 Track your book collection
- 📊 Reading statistics and achievements
- 🔍 Barcode scanning (via Open Library API)
- 📈 Genre distribution and reading streaks
- 🔐 JWT authentication

## Instalación / Installation

### English
1. Add this repository to Home Assistant: `https://github.com/jsr1292/book-tracker-ha`
2. Install the "Book Tracker" addon
3. Configure `JWT_SECRET` environment variable
4. Start the addon
5. Access via Ingress at `/booktracker`

### Español
1. Añade este repositorio a Home Assistant: `https://github.com/jsr1292/book-tracker-ha`
2. Instala el addon "Book Tracker"
3. Configura la variable de entorno `JWT_SECRET`
4. Inicia el addon
5. Accede vía Ingress en `/booktracker`

## Configuración / Configuration

| Variable | Descripción | Default |
|----------|-------------|---------|
| `JWT_SECRET` | Secret for JWT tokens | `change-me-in-production` |
| `PORT` | Web server port | `3000` |

## Acceso / Access

- **Ingress:** `http://homeassistant:8123/booktracker`
- **Directo:** `http://homeassistant:3000` (if host_network enabled)
