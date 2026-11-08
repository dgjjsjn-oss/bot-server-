const mineflayer = require('mineflayer');
const { vec3 } = require('vec3');

const bots = new Map(); // name -> { bot, status, config, intervals }

// Default anti-lag config
const DEFAULT_CONFIG = {
  mode: 'idle',            // 'idle' | 'wander' | 'chat'
  keepalive: true,         // send keepalive chat to prevent idle kick
  keepaliveIntervalMs: 120000, // 2 minutes (less spam = less lag)
  wanderIntervalMs: 15000,     // only move occasionally in wander mode
  maxBots: 10              // hard cap to protect the server
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
    position: { x: 0, y: 0, z: 0 }
  };

  const bot = mineflayer.createBot({
    host: host,
    port: port,
    username: name,
    // No auth: offline/cracked servers only. Appears in Tab list like a real player.
  });

  let keepaliveInterval = null;
  let wanderInterval = null;

  function startKeepalive() {
    if (!merged.keepalive || keepaliveInterval) return;
    keepaliveInterval = setInterval(function () {
      if (bot && bot.isChatAvailable()) {
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
      // Small random offset so the bot looks alive without spamming the server
      const offset = new vec3(
        (Math.random() - 0.5) * 6,
        0,
        (Math.random() - 0.5) * 6
      );
      const target = pos.offset(offset);
      try {
        bot.pathfinder.setGoal(new (require('mineflayer-pathfinder').GoalNear)(target.x, target.y, target.z, 1));
      } catch (e) {
        // pathfinder not loaded; skip movement silently to avoid lag
      }
      status.position = { x: pos.x, y: pos.y, z: pos.z };
      status.lastActivity = new Date().toISOString();
    }, merged.wanderIntervalMs);
  }

  function stopWander() {
    if (wanderInterval) { clearInterval(wanderInterval); wanderInterval = null; }
  }

  bot.on('login', function () {
    status.connected = true;
    status.lastActivity = new Date().toISOString();
    status.error = null;
    console.log('[bot:' + name + '] Logged in (tab-list player)');
  });

  bot.on('spawn', function () {
    status.lastActivity = new Date().toISOString();
    status.position = bot.entity ? { x: bot.entity.position.x, y: bot.entity.position.y, z: bot.entity.position.z } : status.position;
    startKeepalive();
    startWander();
    console.log('[bot:' + name + '] Spawned');
  });

  bot.on('end', function () {
    status.connected = false;
    stopKeepalive();
    stopWander();
    console.log('[bot:' + name + '] Disconnected. Reconnecting in 10s...');
    setTimeout(function () {
      if (bots.has(name)) {
        try { bot.end(); } catch (e) { /* ignore */ }
        const replacement = mineflayer.createBot({
          host: host,
          port: port,
          username: name,
        });
        adoptBot(name, replacement, status, merged);
      }
    }, 10000);
  });

  bot.on('error', function (err) {
    status.error = err.message;
    console.error('[bot:' + name + '] Error:', err.message);
  });

  bot.on('chat', function (username, message) {
    if (username === name) return;
    status.lastActivity = new Date().toISOString();
  });

  bot.on('update_health', function () {
    if (bot.entity) {
      status.position = { x: bot.entity.position.x, y: bot.entity.position.y, z: bot.entity.position.z };
    }
  });

  bots.set(name, { bot: bot, status: status, config: merged });

  return status;
}

function adoptBot(name, newBot, status, merged) {
  let keepaliveInterval = null;
  let wanderInterval = null;

  function startKeepalive() {
    if (!merged.keepalive || keepaliveInterval) return;
    keepaliveInterval = setInterval(function () {
      if (newBot && newBot.isChatAvailable()) {
        newBot.chat('keepalive');
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
      if (!newBot || !newBot.entity) return;
      const pos = newBot.entity.position;
      const offset = new vec3((Math.random() - 0.5) * 6, 0, (Math.random() - 0.5) * 6);
      const target = pos.offset(offset);
      try {
        newBot.pathfinder.setGoal(new (require('mineflayer-pathfinder').GoalNear)(target.x, target.y, target.z, 1));
      } catch (e) { /* skip movement */ }
      status.position = { x: pos.x, y: pos.y, z: pos.z };
      status.lastActivity = new Date().toISOString();
    }, merged.wanderIntervalMs);
  }
  function stopWander() {
    if (wanderInterval) { clearInterval(wanderInterval); wanderInterval = null; }
  }

  newBot.on('login', function () {
    status.connected = true;
    status.lastActivity = new Date().toISOString();
    status.error = null;
  });
  newBot.on('spawn', function () {
    status.lastActivity = new Date().toISOString();
    status.position = newBot.entity ? { x: newBot.entity.position.x, y: newBot.entity.position.y, z: newBot.entity.position.z } : status.position;
    startKeepalive();
    startWander();
  });
  newBot.on('end', function () {
    status.connected = false;
    stopKeepalive();
    stopWander();
  });
  newBot.on('error', function (err) {
    status.error = err.message;
  });

  const entry = bots.get(name);
  if (entry) entry.bot = newBot;
}

function listBots() {
  const out = [];
  for (const [name, entry] of bots.entries()) {
    out.push({
      name: entry.status.name,
      connected: entry.status.connected,
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
  return {
    name: entry.status.name,
    connected: entry.status.connected,
    host: entry.status.host,
    port: entry.status.port,
    mode: entry.status.mode,
    lastActivity: entry.status.lastActivity,
    error: entry.status.error,
    position: entry.status.position
  };
}

function removeBot(name) {
  const entry = bots.get(name);
  if (!entry) return false;
  try { entry.bot.end(); } catch (e) { /* ignore */ }
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
  // Restart/stop wander based on new mode
  if (mode === 'wander') {
    // startWander will be handled by entry.bot spawn/login or we can trigger directly
    if (entry.bot.entity) startWanderFor(entry);
  } else {
    stopWanderFor(entry);
  }
  return { name: name, mode: mode };
}

function startWanderFor(entry) {
  if (entry._wanderInt) return;
  const merged = entry.config;
  entry._wanderInt = setInterval(function () {
    if (!entry.bot || !entry.bot.entity) return;
    const pos = entry.bot.entity.position;
    const offset = new vec3((Math.random() - 0.5) * 6, 0, (Math.random() - 0.5) * 6);
    const target = pos.offset(offset);
    try {
      entry.bot.pathfinder.setGoal(new (require('mineflayer-pathfinder').GoalNear)(target.x, target.y, target.z, 1));
    } catch (e) { /* skip */ }
    entry.status.position = { x: pos.x, y: pos.y, z: pos.z };
    entry.status.lastActivity = new Date().toISOString();
  }, merged.wanderIntervalMs);
}
function stopWanderFor(entry) {
  if (entry._wanderInt) { clearInterval(entry._wanderInt); entry._wanderInt = null; }
}

function botChat(name, message) {
  const entry = bots.get(name);
  if (!entry || !entry.status.connected) {
    throw new Error('Bot not connected: ' + name);
  }
  entry.bot.chat(message);
  entry.status.lastActivity = new Date().toISOString();
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
