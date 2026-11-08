require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const {
  createBot, listBots, getBot, removeBot, setMode, botChat, DEFAULT_CONFIG
} = require('./bots');

const app = express();
const PORT = parseInt(process.env.PORT) || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Optional default bot from env
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

// Health
app.get('/ping', function (req, res) {
  res.send('pong');
});

app.get('/status', function (req, res) {
  res.json({ bots: listBots().length, uptime: process.uptime(), config: DEFAULT_CONFIG });
});

app.get('/', function (req, res) {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', function () {
  console.log('[web] Control panel listening on http://0.0.0.0:' + PORT);
});
