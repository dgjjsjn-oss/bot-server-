const mineflayer = require('mineflayer');
const { vec3 } = require('vec3');

const bots = new Map();

const DEFAULT_CONFIG = {
  mode: 'idle',
  keepalive: true,
  keepaliveIntervalMs: 120000,
  wanderIntervalMs: 15000,
  maxBots: 10,
  autoLogin: true,
  botPassword: null,
  loginDelayMs: 5000,
  reconnectDelayMs: 15000,
  version: '1.21.11'
};

function createBot(name, host, port, config = {}) {
  if (bots.has(name)) {
    throw new Error('Bot already exists: ' + name);
  }
  if (bots.size >= (config.maxBots || DEFAULT_CONFIG.maxBots)) {
    throw new Error('Bot limit reached (' + (config.maxBots || DEFAULT_CONFIG.maxBots) + '). Remove a bot first.');
  }

  const merged = Object.assign({}, DEFAULT_CONFIG, config);

  const status = {
    name: name,
    connected: false,
    host: host,
    port: port,
    mode: merged.mode,
    lastActivity: null,
    error: null,
    position: { x: 0, y: 0, z: 0 },
    loggedIn: false
  };

  let bot = null;
  let keepaliveInterval = null;
  let wanderInterval = null;
  let reconnectTimeout = null;

  function createInstance() {
    try {
      bot = mineflayer.createBot({
        host: host,
        port: port,
        username: name,
        version: merged.version
      });
    } catch (e) {
      status.error = e.message;
      console.error('[bot:' + name + '] Create failed:', e.message);
      scheduleReconnect();
      return;
    }

    wireEvents(bot);
  }

  function wireEvents(botInstance) {
    botInstance.on('login', function () {
      status.connected = true;
      status.lastActivity = new Date().toISOString();
      status.error = null;
      console.log('[bot:' + name + '] Logged in to server');
    });

    botInstance.on('spawn', function () {
      status.lastActivity = new Date().toISOString();
      status.position = botInstance.entity
        ? { x: botInstance.entity.position.x, y: botInstance.entity.position.y, z: botInstance.entity.position.z }
        : status.position;
      startKeepalive();
      startWander();

      if (merged.autoLogin && merged.botPassword) {
        setTimeout(function () {
          if (botInstance && botInstance.isChatAvailable()) {
            botInstance.chat('/login ' + merged.botPassword);
            console.log('[bot:' + name + '] Sent /login');
          }
        }, merged.loginDelayMs);
      }

      console.log('[bot:' + name + '] Spawned');
    });

    botInstance.on('end', function () {
      status.connected = false;
      status.loggedIn = false;
      stopKeepalive();
      stopWander();
      console.log('[bot:' + name + '] Disconnected. Reconnecting...');
      scheduleReconnect();
    });

    botInstance.on('error', function (err) {
      status.error = err.message;
      console.error('[bot:' + name + '] Error:', err.message);
    });

    botInstance.on('chat', function (username, message) {
      if (username === name) return;
      status.lastActivity = new Date().toISOString();
    });
  }

  function scheduleReconnect() {
    if (reconnectTimeout) clearTimeout(reconnectTimeout);
    reconnectTimeout = setTimeout(function () {
      if (bots.has(name)) {
        console.log('[bot:' + name + '] Attempting reconnect...');
        createInstance();
      }
    }, merged.reconnectDelayMs);
  }

  function startKeepalive() {
    if (!merged.keepalive || keepaliveInterval) return;
    keepaliveInterval = setInterval(function () {
      if (bot && bot.isChatAvailable() && status.loggedIn) {
        bot.chat('keepalive');
        status.lastActivity = new Date().toISOString();
      }
    }, merged.keepaliveIntervalMs);
  }

  function stopKeepalive() {
    if (keepaliveInterval) { clearInterval(keepaliveInterval); keepaliveInterval = null; }
  }

  function startWander() {
    if (merged.mode !== 'wander' || wanderInterval) return;
    wanderInterval = setInterval(function () {
      if (!bot || !bot.entity) return;
      const pos = bot.entity.position;
      const offset = new vec3((Math.random() - 0.5) * 6, 0, (Math.random() - 0.5) * 6);
      const target = pos.offset(offset);
      try {
        bot.pathfinder.setGoal(new (require('mineflayer-pathfinder').GoalNear)(target.x, target.y, target.z, 1));
      } catch (e) { /* skip */ }
      status.position = { x: pos.x, y: pos.y, z: pos.z };
      status.lastActivity = new Date().toISOString();
    }, merged.wanderIntervalMs);
  }

  function stopWander() {
    if (wanderInterval) { clearInterval(wanderInterval); wanderInterval = null; }
  }

  createInstance();

  const entry = {
    status: status,
    config: merged,
    _botInstance: bot
  };

  bots.set(name, entry);

  return status;
}

function listBots() {
  const out = [];
  for (const [name, entry] of bots.entries()) {
    out.push({
      name: entry.status.name,
      connected: entry.status.connected,
      loggedIn: entry.status.loggedIn,
      host: entry.status.host,
      port: entry.status.port,
      mode: entry.status.mode,
      lastActivity: entry.status.lastActivity,
      error: entry.status.error,
      position: entry.status.position
    });
  }
  return out;
}

function getBot(name) {
  const entry = bots.get(name);
  if (!entry) return null;
  return entry.status;
}

function removeBot(name) {
  const entry = bots.get(name);
  if (!entry) return false;
  try {
    if (entry._botInstance) entry._botInstance.end();
  } catch (e) { /* ignore */ }
  bots.delete(name);
  return true;
}

function setMode(name, mode) {
  const entry = bots.get(name);
  if (!entry) throw new Error('Bot not found: ' + name);
  if (mode !== 'idle' && mode !== 'wander' && mode !== 'chat') {
    throw new Error('Invalid mode: ' + mode);
  }
  entry.status.mode = mode;
  entry.config.mode = mode;
  return { name: name, mode: mode };
}

function botChat(name, message) {
  const entry = bots.get(name);
  if (!entry || !entry.status.connected) {
    throw new Error('Bot not connected: ' + name);
  }
  const botRef = entry._botInstance;
  if (botRef && botRef.isChatAvailable()) {
    botRef.chat(message);
    entry.status.lastActivity = new Date().toISOString();
  } else {
    throw new Error('Bot not ready for chat');
  }
}

module.exports = {
  createBot: createBot,
  listBots: listBots,
  getBot: getBot,
  removeBot: removeBot,
  setMode: setMode,
  botChat: botChat,
  DEFAULT_CONFIG: DEFAULT_CONFIG
};
