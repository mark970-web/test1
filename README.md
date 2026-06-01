# Running VacayYay Locally & Sharing Online with ngrok

## Prerequisites

Make sure you have **Node.js** installed. Check by running:

```bash
node -v
npm -v
```

If not installed, download it from [nodejs.org](https://nodejs.org) (LTS version recommended).

---

## 1. Install npm dependencies

Navigate to the project folder and install everything:

```bash
cd vacayyay_fullstack
npm install
```

This reads `package.json` and installs all dependencies into `node_modules/`.

---

## 2. Start the server

### Normal start:
```bash
npm start
```

### Auto-restart on file changes (development):
```bash
npm run dev
```

> Requires `nodemon` which is already in the dev dependencies.

The app will be live at **http://localhost:3000**

---

## 3. Install ngrok

ngrok creates a public URL that tunnels to your localhost so anyone on the internet can access your app.

### Option A — Download directly
1. Go to [ngrok.com](https://ngrok.com) and create a free account
2. Download the binary for your OS from the dashboard
3. Move it somewhere on your PATH (e.g. `/usr/local/bin/ngrok` on Linux/Mac)

### Option B — Install via package manager

**Mac (Homebrew):**
```bash
brew install ngrok/ngrok/ngrok
```

**Linux (snap):**
```bash
sudo snap install ngrok
```

**Windows (Chocolatey):**
```bash
choco install ngrok
```

### Verify install:
```bash
ngrok version
```

---

## 4. Authenticate ngrok (one-time setup)

After creating your free account at [ngrok.com](https://ngrok.com), copy your auth token from the dashboard and run:

```bash
ngrok config add-authtoken YOUR_TOKEN_HERE
```

You only need to do this once — it saves to `~/.config/ngrok/ngrok.yml`.

---

## 5. Share your app online

Make sure your server is already running (`npm start`), then in a **separate terminal**:

```bash
ngrok http 3000
```

ngrok will display something like:

```
Forwarding   https://abc123.ngrok-free.app -> http://localhost:3000
```

Share that `https://...ngrok-free.app` URL with anyone — they can access your running app from anywhere.

> **Note:** On the free plan, visitors will see an ngrok warning page on first visit. They just click "Visit Site" to proceed. The URL also changes every time you restart ngrok.

---

## 6. Full startup (both at once)

Open two terminal windows:

**Terminal 1 — start the app:**
```bash
cd vacayyay_fullstack
npm start
```

**Terminal 2 — start the tunnel:**
```bash
ngrok http 3000
```

---

## Stopping everything

- Stop the Node server: `Ctrl + C` in Terminal 1
- Stop ngrok: `Ctrl + C` in Terminal 2

Or kill by port if something is stuck:

```bash
# Linux / Mac
fuser -k 3000/tcp

# Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

---

## Quick reference

| Command | What it does |
|---|---|
| `npm install` | Install dependencies |
| `npm start` | Start the server |
| `npm run dev` | Start with auto-reload |
| `ngrok http 3000` | Create public tunnel to port 3000 |
| `ngrok config add-authtoken TOKEN` | Save your ngrok auth token |

---

## Deploying free on Render (no credit card)

This app runs as a persistent Node/Express service, so it needs a host that runs Node — not a static host. Render's free web service works without a credit card.

### Steps
1. Push this folder to a **GitHub** repo.
2. Go to [render.com](https://render.com) and sign up (GitHub login is fine).
3. Click **New + → Blueprint** and pick this repo. Render reads `render.yaml`
   and configures everything automatically (build = `npm install`,
   start = `node server.js`, and a generated `JWT_SECRET`).
   - *Or* choose **New + → Web Service** and set Build Command `npm install`,
     Start Command `node server.js` manually.
4. Wait for the build, then open the `*.onrender.com` URL.

### Important: data does not persist on the free tier
Render's free filesystem is **ephemeral**. The SQLite database and any uploaded
images are wiped whenever the service redeploys, restarts, or spins down (free
services sleep after ~15 min idle, with a 30–60s cold start on the next visit).

- Seeded demo listings always return — `db.js` re-seeds from `data/properties.json` on every startup.
- Runtime data (new sign-ups, bookings, reviews, wishlists, uploaded photos) is **lost** on each restart.

For a course demo shown in one sitting, this is fine. To persist data permanently
you'd migrate from SQLite to a managed database (e.g. Render Postgres) and move
uploads to external object storage.

### Node version
`package.json` pins Node 20 (`engines.node`) and `.nvmrc` sets `20`. This matters:
`better-sqlite3` ships a prebuilt binary for Node 20, so Render installs it instantly
instead of compiling from source.
"# test1" 
