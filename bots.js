const mineflayer = require('mineflayer');
const { vec3 } = require('vec3');

const bots = new Map();

const DEFAULT_CONFIG = {
  mode: 'idle',            // 'idle' | 'wander' | 'chat'
  keepalive: true,
  keepaliveIntervalMs: 120000,
  wanderIntervalMs: 15000,
  jumpIntervalMs: 20000,   // jump occasionally to look alive
  lookIntervalMs: 5000,    // look around randomly
  maxBots: 10,
  autoLogin: true,
  botPassword: null,
  loginDelayMs: 5000,
  reconnectDelayMs: 15000,
  version: '1.21.11',
  autoReply: true,         // auto-reply to chat messages
  replyChance: 0.7         // 70% chance to reply when someone talks
};

// Simple auto-reply responses so the bot feels like a real player
const AUTO_REPLIES = [
  "yo",
  "hi",
  "hello",
  "sup",
  "what's up",
  "im just playing",
  "cool server",
  "nice",
  "lol",
  "haha",
  "im afk for a sec",
  "brb",
  "gg",
  "wp",
  "good game",
  "lets go",
  "im here",
  "what?",
  "where?",
  "how?",
  "who is there?"
];

function getRandomReply() {
  return AUTO_REPLIES[Math.floor(Math.random() * AUTO_REPLIES.length)];
}

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
  let jumpInterval = null;
  let lookInterval = null;
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
      startJump();
      startLook();

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
      stopJump();
      stopLook();
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

      // Auto-reply to players so the bot feels like a real player
      if (merged.autoReply && Math.random() < merged.replyChance) {
        setTimeout(function () {
          if (botInstance && botInstance.isChatAvailable() && status.loggedIn) {
            botInstance.chat(getRandomReply());
            console.log('[bot:' + name + '] Auto-replied to ' + username);
          }
        }, 1000 + Math.random() * 3000);
      }
    });

    botInstance.on('update_health', function () {
      if (botInstance.entity) {
        status.position = {
          x: botInstance.entity.position.x,
          y: botInstance.entity.position.y,
          z: botInstance.entity.position.z
        };
      }
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
      const offset = new vec3((Math.random() - 0.5) * 8, 0, (Math.random() - 0.5) * 8);
      const target = pos.offset(offset);
      try {
        bot.pathfinder.setGoal(new (require('mineflayer-pathfinder').GoalNear)(target.x, target.y, target.z, 1));
      } catch (e) { /* skip movement silently */ }
      status.position = { x: pos.x, y: pos.y, z: pos.z };
      status.lastActivity = new Date().toISOString();
    }, merged.wanderIntervalMs);
  }

  function stopWander() {
    if (wanderInterval) { clearInterval(wanderInterval); wanderInterval = null; }
  }

  function startJump() {
    if (merged.mode !== 'wander' || jumpInterval) return;
    jumpInterval = setInterval(function () {
      if (!bot || !bot.entity) return;
      try {
        bot.setControlState('jump', true);
        setTimeout(function () {
          if (bot) bot.setControlState('jump', false);
        }, 500);
      } catch (e) { /* skip */ }
    }, merged.jumpIntervalMs);
  }

  function stopJump() {
    if (jumpInterval) { clearInterval(jumpInterval); jumpInterval = null; }
    if (bot) {
      try { bot.setControlState('jump', false); } catch (e) { /* skip */ }
    }
  }

  function startLook() {
    if (merged.mode !== 'wander' || lookInterval) return;
    lookInterval = setInterval(function () {
      if (!bot || !bot.entity) return;
      try {
        bot.look(
          Math.random() * Math.PI * 2,
          (Math.random() - 0.5) * Math.PI,
          true
        );
      } catch (e) { /* skip */ }
    }, merged.lookIntervalMs);
  }

  function stopLook() {
    if (lookInterval) { clearInterval(lookInterval); lookInterval = null; }
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

  // Restart/stop movement behaviors based on new mode
  if (mode === 'wander') {
    if (!entry.config.jumpInterval) entry.config.jumpInterval = DEFAULT_CONFIG.jumpIntervalMs;
    if (!entry.config.lookInterval) entry.config.lookInterval = DEFAULT_CONFIG.lookIntervalMs;
    startWanderFor(entry);
    startJumpFor(entry);
    startLookFor(entry);
  } else {
    stopWanderFor(entry);
    stopJumpFor(entry);
    stopLookFor(entry);
  }
  return { name: name, mode: mode };
}

function startWanderFor(entry) {
  if (entry._wanderInt) return;
  const merged = entry.config;
  entry._wanderInt = setInterval(function () {
    if (!entry._botInstance || !entry._botInstance.entity) return;
    const pos = entry._botInstance.entity.position;
    const offset = new vec3((Math.random() - 0.5) * 8, 0, (Math.random() - 0.5) * 8);
    const target = pos.offset(offset);
    try {
      entry._botInstance.pathfinder.setGoal(new (require('mineflayer-pathfinder').GoalNear)(target.x, target.y, target.z, 1));
    } catch (e) { /* skip */ }
    entry.status.position = { x: pos.x, y: pos.y, z: pos.z };
    entry.status.lastActivity = new Date().toISOString();
  }, merged.wanderIntervalMs);
}
function stopWanderFor(entry) {
  if (entry._wanderInt) { clearInterval(entry._wanderInt); entry._wanderInt = null; }
}

function startJumpFor(entry) {
  if (entry._jumpInt) return;
  const merged = entry.config;
  entry._jumpInt = setInterval(function () {
    if (!entry._botInstance || !entry._botInstance.entity) return;
    try {
      entry._botInstance.setControlState('jump', true);
      setTimeout(function () {
        if (entry._botInstance) entry._botInstance.setControlState('jump', false);
      }, 500);
    } catch (e) { /* skip */ }
  }, merged.jumpIntervalMs);
}
function stopJumpFor(entry) {
  if (entry._jumpInt) { clearInterval(entry._jumpInt); entry._jumpInt = null; }
}

function startLookFor(entry) {
  if (entry._lookInt) return;
  const merged = entry.config;
  entry._lookInt = setInterval(function () {
    if (!entry._botInstance || !entry._botInstance.entity) return;
    try {
      entry._botInstance.look(
        Math.random() * Math.PI * 2,
        (Math.random() - 0.5) * Math.PI,
        true
      );
    } catch (e) { /* skip */ }
  }, merged.lookIntervalMs);
}
function stopLookFor(entry) {
  if (entry._lookInt) { clearInterval(entry._lookInt); entry._lookInt = null; }
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
