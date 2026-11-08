require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { createBot, listBots, getBot, removeBot, setMode, botChat, DEFAULT_CONFIG } = require('./bots');
const { pingServer } = require('./keepalive-pinger');

const app = express();
const PORT = parseInt(process.env.PORT) || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Optional default bot from env (only needed if you want a real bot in tab list)
const defaultHost = process.env.MC_HOST;
const defaultPort = parseInt(process.env.MC_PORT) || 25565;
const defaultName = process.env.BOT_NAME || 'KeepAliveBot';
if (defaultHost) {
  try {
    createBot(defaultName, defaultHost, defaultPort, DEFAULT_CONFIG);
    console.log('[web] Default bot created: ' + defaultName);
  } catch (e) {
    console.error('[web] Could not create default bot:', e.message);
  }
}

// Auto ping your Minecraft server from Render so the host sees activity.
// Disabled by default; enable with AUTO_PING_SERVER=true
const AUTO_PING = process.env.AUTO_PING_SERVER === 'true';
const PING_INTERVAL_MS = parseInt(process.env.PING_INTERVAL_MS) || 180000; // 3 minutes

let lastPing = { ok: null, time: null, error: null };

async function doPing() {
  if (!defaultHost) return;
  try {
    const result = await pingServer(defaultHost, defaultPort);
    lastPing = { ok: true, time: new Date().toISOString(), error: null, raw: result.raw };
    console.log('[ping] Minecraft server responded OK');
  } catch (e) {
    lastPing = { ok: false, time: new Date().toISOString(), error: e.message };
    console.error('[ping] Minecraft server ping failed:', e.message);
  }
}

if (AUTO_PING && defaultHost) {
  setInterval(doPing, PING_INTERVAL_MS);
  doPing();
  console.log('[web] Auto-ping enabled for ' + defaultHost + ':' + defaultPort);
}

// List all bots
app.get('/api/bots', function (req, res) {
  res.json(listBots());
});

// Summon a new real-feeling player bot
app.post('/api/bots', function (req, res) {
  const { name, host, port, mode, maxBots } = req.body;
  if (!name || !host) {
    return res.status(400).json({ error: 'name and host are required' });
  }
  try {
    const status = createBot(name, host, parseInt(port) || 25565, {
      mode: mode || 'idle',
      maxBots: maxBots || DEFAULT_CONFIG.maxBots
    });
    res.status(201).json(status);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Get single bot status
app.get('/api/bots/:name', function (req, res) {
  const b = getBot(req.params.name);
  if (!b) return res.status(404).json({ error: 'Bot not found' });
  res.json(b);
});

// Change bot mode (idle / wander / chat)
app.patch('/api/bots/:name/mode', function (req, res) {
  const { mode } = req.body;
  if (!mode) return res.status(400).json({ error: 'mode required' });
  try {
    const result = setMode(req.params.name, mode);
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Remove / kick a bot
app.delete('/api/bots/:name', function (req, res) {
  const ok = removeBot(req.params.name);
  if (!ok) return res.status(404).json({ error: 'Bot not found' });
  res.json({ ok: true });
});

// Send chat from a bot
app.post('/api/bots/:name/chat', function (req, res) {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'message required' });
  try {
    botChat(req.params.name, message);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Manual trigger to ping your Minecraft server from Render
app.post('/api/ping-server', async function (req, res) {
  await doPing();
  res.json(lastPing);
});

// Get last ping result
app.get('/api/ping-server', function (req, res) {
  res.json(lastPing);
});

// Health
app.get('/ping', function (req, res) {
  res.send('pong');
});

app.get('/status', function (req, res) {
  res.json({ bots: listBots().length, uptime: process.uptime(), config: DEFAULT_CONFIG, lastPing });
});

app.get('/', function (req, res) {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', function () {
  console.log('[web] Control panel listening on http://0.0.0.0:' + PORT);
});
