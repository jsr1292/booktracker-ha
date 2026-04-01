# Book Tracker - Home Assistant Addon

Personal book tracking library with barcode scanning and reading statistics, packaged as a Home Assistant addon.

## What is this?

Book Tracker is a self-hosted web application for tracking your book collection. It features:
- 📚 Book library management (add, edit, delete books)
- 📊 Reading statistics and achievements
- 🔍 Barcode scanning via Open Library API
- 📈 Genre distribution and reading streak tracking
- 🔐 JWT-based authentication

## How to Add This Repository to Home Assistant

1. Go to **Settings → Add-ons, Backups & Supervisor → Add-on Store**
2. Click the **⋮** menu → **Repositories**
3. Add: `https://github.com/jsr1292/book-tracker-ha`
4. Click **Add** → **Close**
5. The "Book Tracker" addon will appear in the store

## How to Install

1. Find "Book Tracker" in the addon store
2. Click **Install**
3. (Optional) Set a strong `JWT_SECRET` environment variable
4. Click **Start**
5. Wait for the addon to start, then click **Open UI** or navigate to `/booktracker`

## How to Access

- **Via Ingress (recommended):** `http://homeassistant:8123/booktracker`
- **Direct access:** `http://<home-assistant-ip>:3000` (if you enable host_network)

## Features

### Library Management
- Add books manually or via barcode scan (Open Library)
- Track reading status: Reading, Finished, Abandoned, Planned
- Rate books (1-5 stars)
- Record pages, genre, language, dates
- Personal notes per book

### Statistics & Achievements
- Total books, finished books, currently reading
- Total pages read, average pages per book
- Global average rating
- Reading streak (months in a row)
- Average days to finish a book
- Mind sharpness score (gamified)
- Genre distribution
- 10 achievements to unlock

### Authentication
- JWT-based auth (7-day tokens)
- Register new accounts
- Login with username/password
- All API routes protected

## Screenshots

> **[Screenshot: Library View]**  
> *[Placeholder for library screenshot]*

> **[Screenshot: Book Detail]**  
> *[Placeholder for book detail screenshot]*

> **[Screenshot: Statistics Dashboard]**  
> *[Placeholder for statistics screenshot]*

> **[Screenshot: Add Book / Barcode Scan]**  
> *[Placeholder for add book screenshot]*

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `JWT_SECRET` | string | `change-me-in-production` | Secret for signing JWT tokens. **Change this!** |
| `PORT` | int | `3000` | Internal web server port |

## Technical Details

- **Runtime:** Node.js 20 (Alpine Linux)
- **Database:** SQLite (persistent via `/data` volume)
- **Static files:** React SPA served from `/app/server/dist-client/dist`
- **Ingress:** Enabled at path `/booktracker`
- **Architectures:** amd64, aarch64, armv7

## Data Persistence

The addon stores data in the `/data` volume:
- `database.sqlite` - All book and user data

**Important:** The `/data` volume is preserved across addon updates and restarts.

## Updating

1. Back up your `/data` volume (contains your database)
2. Update the addon from the Home Assistant interface
3. Restart the addon — your data will be preserved

## Troubleshooting

**Q: Ingress shows 404**  
A: Make sure ingress is enabled in the addon config and you're using the correct path (`/booktracker`).

**Q: Can't login after restart**  
A: The users table is in the SQLite database which persists. If you lost your password, you'll need to register a new account.

**Q: Books not showing**  
A: Each user has their own books. Make sure you're logged in as the correct user.

## Support

For issues or feature requests, open an issue at:  
`https://github.com/jsr1292/book-tracker-ha`

## License

MIT License
