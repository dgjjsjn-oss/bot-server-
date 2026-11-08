require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { createBot, listBots, getBot, removeBot, setMode, botChat, setAutoChat, setSpam, DEFAULT_CONFIG, getRandomName } = require('./bots');
const { pingServer } = require('./keepalive-pinger');

const app = express();
const PORT = parseInt(process.env.PORT) || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const defaultHost = process.env.MC_HOST || '';
const defaultPort = parseInt(process.env.MC_PORT) || 29349;
let defaultName = process.env.BOT_NAME || 'KeepAliveBot';

if (defaultHost) {
  try {
    createBot(defaultName, defaultHost, defaultPort, DEFAULT_CONFIG);
    console.log('[web] Default bot created: ' + defaultName);
  } catch (e) {
    console.error('[web] Default bot failed:', e.message);
  }
}

const AUTO_PING = process.env.AUTO_PING_SERVER === 'true';
const PING_INTERVAL_MS = parseInt(process.env.PING_INTERVAL_MS) || 180000;
let lastPing = { ok: null, time: null, error: null };

async function doPing() {
  if (!defaultHost) return;
  try {
    const result = await pingServer(defaultHost, defaultPort);
    lastPing = { ok: true, time: new Date().toISOString(), error: null };
    console.log('[ping] Minecraft server OK');
  } catch (e) {
    lastPing = { ok: false, time: new Date().toISOString(), error: e.message };
    console.error('[ping] Failed:', e.message);
  }
}

if (AUTO_PING && defaultHost) {
  setInterval(doPing, PING_INTERVAL_MS);
  doPing();
}

app.get('/api/config', function (req, res) {
  res.json({ host: defaultHost, port: defaultPort });
});

app.get('/api/bots', function (req, res) {
  res.json(listBots());
});

app.post('/api/bots', function (req, res) {
  const { name, host, port, mode, maxBots, botPassword, autoLogin } = req.body;
  if (!name) return res.status(400).json({ error: 'bot name required' });
  const h = host || defaultHost;
  const p = port || defaultPort;
  if (!h) return res.status(400).json({ error: 'no host configured' });
  try {
    const status = createBot(name, h, parseInt(p) || 25565, {
      mode: mode || 'wander',
      maxBots: maxBots || DEFAULT_CONFIG.maxBots,
      botPassword: botPassword || null,
      autoLogin: autoLogin !== undefined ? autoLogin : true
    });
    res.status(201).json(status);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

app.post('/api/bots/bulk', async function (req, res) {
  const { count, host, port, mode, botPassword, autoLogin, prefix, randomNames } = req.body;
  const countNum = Math.min(Math.max(parseInt(count) || 1, 1), 99);
  const h = host || defaultHost;
  const p = port || defaultPort;
  if (!h) return res.status(400).json({ error: 'no host configured' });

  const results = [];
  const errors = [];

  for (let i = 0; i < countNum; i++) {
    let botName;
    if (randomNames) {
      botName = getRandomName();
    } else {
      botName = (prefix || 'Bot') + '_' + (i + 1);
    }
    try {
      const status = createBot(botName, h, parseInt(p) || 25565, {
        mode: mode || 'wander',
        maxBots: DEFAULT_CONFIG.maxBots,
        botPassword: botPassword || null,
        autoLogin: autoLogin !== undefined ? autoLogin : true
      });
      results.push(status);
    } catch (e) {
      errors.push({ name: botName, error: e.message });
    }
    if (i < countNum - 1) {
      await sleep(500);
    }
  }

  res.status(201).json({ summoned: results.length, requested: countNum, bots: results, errors: errors });
});

app.get('/api/bots/:name', function (req, res) {
  const b = getBot(req.params.name);
  if (!b) return res.status(404).json({ error: 'Bot not found' });
  res.json(b);
});

app.patch('/api/bots/:name/mode', function (req, res) {
  const { mode } = req.body;
  if (!mode) return res.status(400).json({ error: 'mode required' });
  try { res.json(setMode(req.params.name, mode)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

app.delete('/api/bots/:name', function (req, res) {
  if (removeBot(req.params.name)) res.json({ ok: true });
  else res.status(404).json({ error: 'Bot not found' });
});

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

app.post('/api/bots/:name/autochat', function (req, res) {
  const { message } = req.body;
  try { res.json({ ok: true, ...setAutoChat(req.params.name, message) }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

app.post('/api/bots/:name/spam', function (req, res) {
  const { message, intervalMs } = req.body;
  try { res.json({ ok: true, ...setSpam(req.params.name, message, intervalMs) }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

app.post('/api/test-connection', async function (req, res) {
  const { host, port } = req.body;
  const h = host || defaultHost;
  const p = port || defaultPort;
  if (!h) return res.status(400).json({ error: 'no host' });
  try {
    const result = await pingServer(h, parseInt(p) || 25565);
    res.json({ ok: true, host: h, port: p, result: result.raw ? result.raw.substring(0, 300) : 'connected' });
  } catch (e) {
    res.json({ ok: false, host: h, port: p, error: e.message });
  }
});

app.post('/api/ping-server', async function (req, res) {
  await doPing();
  res.json(lastPing);
});
app.get('/api/ping-server', function (req, res) { res.json(lastPing); });

app.get('/ping', function (req, res) { res.send('pong'); });
app.get('/status', function (req, res) {
  res.json({ bots: listBots().length, uptime: process.uptime(), lastPing });
});
app.get('/', function (req, res) {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', function () {
  console.log('[web] Listening on http://0.0.0.0:' + PORT);
});