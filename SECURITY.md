# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability, please **do not** open a public issue. Instead, open a private security advisory on GitHub:

1. Go to **Security → Advisories** on the repository
2. Click **Report a vulnerability**
3. Describe the issue with steps to reproduce

I'll respond within 48 hours and work on a fix.

## Security Model

### Authentication
- **JWT tokens** with 7-day expiry, auto-generated secret per container
- **Rate limiting**: 5 login attempts per minute per IP
- **Registration disabled** by default — admin-controlled user creation only
- **Auto-logout** on token expiry (401 response)

### Data
- All data stored locally in **SQLite** (`/data/database.sqlite`)
- No cloud syncing, no telemetry, no data leaves your network
- Outbound calls only to public book APIs (Open Library, Google Books) — read-only
- Database persists across addon updates

### Network
- Designed to run behind a **reverse proxy** with HTTPS
- CORS whitelist restricts API access to configured domains
- CSP headers prevent XSS and unauthorized resource loading

### Secrets
- **JWT_SECRET**: Auto-generated at container start (random 64-byte hex)
- **admin_key**: Set by user in addon options, used for creating new users
- Always use HTTPS when exposing publicly — admin_key is sent in request body

### Recommendations
- Use **strong secrets** for `admin_key`
- Keep the addon updated
- Prefer local-only access unless you need remote features
- If exposing publicly, use a reverse proxy with HTTPS and strict CORS
