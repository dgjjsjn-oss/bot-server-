# Minecraft Bot Control Panel

Summon fake-player bots (NPCs/workers) to your Minecraft server with no Microsoft/Mojang account, then control them from a website.

Each bot joins your server like a real player (e.g. name it "wembo"), sends keepalive chat so free hosts do not idle-shutdown the server, and can be summoned, kicked, or made to chat from the web panel.

## How it works

1. Deploy `server.js` to Render (free web service).
2. Open the web control panel at your Render URL.
3. Summon bots by name + server host + port. They join via Mineflayer (offline/cracked mode only).
4. Use Uptime Robot / cron-job.org to ping `/ping` every 5–10 minutes so Render never sleeps and the bots stay connected.

## Requirements

- Your Minecraft server must be in **offline mode** (`online-mode=false` in `server.properties`). Account-less bots cannot join authenticated servers.
- Node.js 18+.

## Local setup

```bash
cd minecraft-keepalive-bot

copy .env.example .env     # Windows
# or
cp .env.example .env       # Linux/Mac

# Edit .env: set MC_HOST and MC_PORT to your server

npm install
npm start
```

Open `http://localhost:3000` for the control panel.

## Deploy to Render

1. Push this folder to GitHub.
2. Render → Create **Web Service** → connect repo.
3. Build command: `npm install`
4. Start command: `npm start`
5. Add env vars: `MC_HOST`, `MC_PORT`, optional `BOT_NAME`.
6. Deploy. Public URL like `https://mc-bots.onrender.com`.

## Keep Render awake

Set an uptime monitor to `https://your-app.onrender.com/ping` every 5 minutes (Uptime Robot, cron-job.org, etc.).

## Web API

| Endpoint | Method | Body | Description |
|----------|--------|------|-------------|
| `/api/bots` | GET | — | List all bots with status |
| `/api/bots` | POST | `{name, host, port}` | Summon a new bot |
| `/api/bots/:name` | GET | — | Get one bot's status |
| `/api/bots/:name` | DELETE | — | Kick / remove a bot |
| `/api/bots/:name/chat` | POST | `{message}` | Make the bot send chat |
| `/ping` | GET | — | Health / keepalive endpoint |
| `/status` | GET | — | Summary stats |

## Files

| File | Purpose |
|------|---------|
| `server.js` | Express web server + REST API |
| `bots.js` | Multi-bot Mineflayer manager (summon, kick, chat, auto-reconnect) |
| `public/index.html` | Control panel UI |
| `public/app.js` | Frontend API calls |
| `.env.example` | Copy to `.env` and fill in your server details |
| `package.json` | Dependencies and start script |

## Important notes

- Bots use no authentication. Only works on offline-mode (cracked) servers.
- If your server is `online-mode=true`, you need a premium Minecraft account and Mojang auth — this bot does not handle that.
- This is for servers you own or administer. Do not use it to bypass limits on hosts you do not control.
