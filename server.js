require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { createBot, listBots, getBot, removeBot, setMode, botChat, setAutoChat, setSpam, DEFAULT_CONFIG } = require('./bots');
const { pingServer } = require('./keepalive-pinger');

const app = express();
const PORT = parseInt(process.env.PORT) || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Pre-configured server from .env (so website doesn't need to type host/port)
const defaultHost = process.env.MC_HOST || '';
const defaultPort = parseInt(process.env.MC_PORT) || 29349;
const defaultName = process.env.BOT_NAME || 'KeepAliveBot';

// Optional default bot
if (defaultHost) {
  try {
    createBot(defaultName, defaultHost, defaultPort, DEFAULT_CONFIG);
    console.log('[web] Default bot created: ' + defaultName);
  } catch (e) {
    console.error('[web] Could not create default bot:', e.message);
  }
}

// Auto ping your Minecraft server from Render so the host sees activity.
const AUTO_PING = process.env.AUTO_PING_SERVER === 'true';
const PING_INTERVAL_MS = parseInt(process.env.PING_INTERVAL_MS) || 180000;

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

// Expose server config to frontend so host/port are pre-filled
app.get('/api/config', function (req, res) {
  res.json({
    host: defaultHost,
    port: defaultPort
  });
});

// List all bots
app.get('/api/bots', function (req, res) {
  res.json(listBots());
});

// Summon a new bot (host/port optional - uses env defaults if omitted)
app.post('/api/bots', function (req, res) {
  const { name, host, port, mode, maxBots, botPassword, autoLogin } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'bot name is required' });
  }
  const resolvedHost = host || defaultHost;
  const resolvedPort = port || defaultPort;
  if (!resolvedHost) {
    return res.status(400).json({ error: 'no server host configured' });
  }
  try {
    const status = createBot(name, resolvedHost, parseInt(resolvedPort) || 25565, {
      mode: mode || 'idle',
      maxBots: maxBots || DEFAULT_CONFIG.maxBots,
      botPassword: botPassword || null,
      autoLogin: autoLogin !== undefined ? autoLogin : true
    });
    res.status(201).json(status);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Bulk summon multiple bots with different modes for stress testing
app.post('/api/bots/bulk', function (req, res) {
  const { count, host, port, mode, botPassword, autoLogin, prefix } = req.body;
  const countNum = parseInt(count) || 1;
  if (countNum < 1 || countNum > 99) {
    return res.status(400).json({ error: 'count must be between 1 and 99' });
  }
  const resolvedHost = host || defaultHost;
  const resolvedPort = port || defaultPort;
  if (!resolvedHost) {
    return res.status(400).json({ error: 'no server host configured' });
  }

  const modes = ['idle', 'wander', 'chat'];
  const results = [];
  const errors = [];

  for (let i = 0; i < countNum; i++) {
    const botName = (prefix || 'TestBot') + '_' + (i + 1);
    const botMode = mode || modes[i % modes.length];
    try {
      const status = createBot(botName, resolvedHost, parseInt(resolvedPort) || 25565, {
        mode: botMode,
        maxBots: 99,
        botPassword: botPassword || null,
        autoLogin: autoLogin !== undefined ? autoLogin : true
      });
      results.push(status);
    } catch (e) {
      errors.push({ name: botName, error: e.message });
    }
  }

  res.status(201).json({ summoned: results.length, bots: results, errors: errors });
});

// Get single bot status
app.get('/api/bots/:name', function (req, res) {
  const b = getBot(req.params.name);
  if (!b) return res.status(404).json({ error: 'Bot not found' });
  res.json(b);
});

// Change bot mode
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

// Send chat/command from a bot
app.post('/api/bots/:name/chat', function (req, res) {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'message required' });
  try {
    const result = botChat(req.params.name, message);
    res.json({ ok: true, sent: result.sent });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Set auto-chat on join message
app.post('/api/bots/:name/autochat', function (req, res) {
  const { message } = req.body;
  try {
    const result = setAutoChat(req.params.name, message);
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Set spam message
app.post('/api/bots/:name/spam', function (req, res) {
  const { message, intervalMs } = req.body;
  try {
    const result = setSpam(req.params.name, message, intervalMs);
    res.json({ ok: true, ...result });
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
