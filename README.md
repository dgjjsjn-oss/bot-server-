# Minecraft Keepalive — Website Pings Your Server

Render website keeps itself awake via Uptime Robot, and optionally pings your
Minecraft server port so the host sees activity. No bot accounts, no fake
players, no backdoors, negligible CPU/RAM.

## How it works

```
Uptime Robot → pings https://your-app.onrender.com/ping every 5 min
                              ↓
                    Render stays awake
                              ↓
          Render sends Minecraft status ping to your server port
                              ↓
                    Your host sees activity, stays awake
```

## Deploy to Render

1. Connect GitHub repo `dgjjsjn-oss/bot-server-`
2. Build command: `npm install`
3. Start command: `npm start`
4. Add env vars:
   - `MC_HOST=dogpvp.falix.gg`
   - `MC_PORT=29349`
   - `BOT_NAME=wembo` (optional)
   - `AUTO_PING_SERVER=true`
   - `PING_INTERVAL_MS=180000`
5. Deploy. Copy your Render URL.

## Keep Render awake

Set Uptime Robot to ping `https://your-app.onrender.com/ping` every 5 minutes.

## Test from website

Open your Render URL in a browser. You can manually trigger a ping to your
Minecraft server via the API or check `/api/ping-server` to see the last result.

## Important limits

- This sends a **Minecraft status ping** (the same packet your server browser
  sends when you hover a server in multiplayer). It is lightweight and safe.
- Some free hosts (Falix, Aternos, Minehut) only count **real player
  connections** as activity, not query pings. If your host still sleeps the
  server, the only reliable fix is a real bot connection (requires
  `online-mode=false`) or upgrading your host plan.
- This plugin/website opens no backdoor, listens on no extra ports, and runs
  zero commands on your server.

## Files

| File | Purpose |
|------|---------|
| `server.js` | Express web server + auto pinger |
| `keepalive-pinger.js` | Pure Node Minecraft status ping client |
| `public/index.html` | Control panel UI |
| `public/app.js` | Frontend API calls |
| `.env.example` | Copy to `.env` and fill in your server details |
| `package.json` | Dependencies and start script |
