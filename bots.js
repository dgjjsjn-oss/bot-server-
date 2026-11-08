const mineflayer = require('mineflayer');
const { vec3 } = require('vec3');

const bots = new Map();

const DEFAULT_CONFIG = {
  mode: 'idle',
  keepalive: true,
  keepaliveIntervalMs: 120000,
  wanderIntervalMs: 15000,
  jumpIntervalMs: 20000,
  lookIntervalMs: 5000,
  maxBots: 99,
  autoLogin: true,
  botPassword: null,
  loginDelayMs: 8000,
  reconnectDelayMs: 15000,
  version: '1.21.11',
  autoReply: true,
  replyChance: 0.5,
  maxConsoleLogs: 100,
  autoChatOnJoin: null,
  spamMessage: null,
  spamIntervalMs: 30000
};

const AUTO_REPLIES = [
  "yo", "hi", "hello", "sup", "what's up", "im just playing",
  "cool server", "nice", "lol", "haha", "im afk for a sec",
  "brb", "gg", "wp", "good game", "lets go", "im here",
  "what?", "where?", "how?", "who is there?", "aaa", "omg"
];

const RANDOM_NAMES = [
  "wembo", "Player1", "Noob", "ProGamer", "XxSlayer", "Bot99",
  "Creeper", "Steve", "Alex", "Herobrine", "Notch", "Ghost",
  "Ninja", "Shadow", "Viper", "Blaze", "Frost", "Ember", "Storm",
  "Zenith", "Nova", "Orbit", "Pixel", "Glitch", "Zephyr", "Koda",
  "Rex", "Luna", "Atlas", "Kairo", "Jax", "Zara", "Milo", "Ivy",
  "Ace", "Ryder", "Kai", "Sora", "Hana", "Ren", "Yuki", "Haruto",
  "Mina", "Eli", "Zoe", "Leo", "Maya", "Owen", "Iris", "Leo",
  "Finn", "Aria", "Liam", "Ella", "Noah", "Ava", "Lucas", "Mia",
  "Ethan", "Sofia", "James", "Amelia", "Oliver", "Charlotte",
  "William", "Isabella", "Henry", "Ava", "Theodore", "Luna",
  "Jack", "Scarlett", "Charlie", "Ruby", "Harry", "Grace",
  "George", "Olive", "Freddie", "Rosie", "Albie", "Ivy",
  "Teddy", "Poppy", "Arthur", "Daisy", "Muhammad", "Amelia",
  "Noah", "Olivia", "Leo", "Ava", "Oscar", "Mia", "Arthur",
  "Isla", "Henry", "Sophia", "Freddie", "Grace", "Charlie",
  "Lily", "Albie", "Grace", "Theo", "Emilia", "Archie",
  "Sienna", "Henry", "Elsie", "Jack", "Maya", "Leo", "Aria"
];

function getRandomName() {
  return RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)] + '_' + Math.floor(Math.random() * 9999);
}

function getRandomReply() {
  return AUTO_REPLIES[Math.floor(Math.random() * AUTO_REPLIES.length)];
}

function addConsoleLog(entry, type, message) {
  const log = {
    time: new Date().toISOString(),
    type: type,
    message: message
  };
  entry.consoleLogs.push(log);
  if (entry.consoleLogs.length > entry.config.maxConsoleLogs) {
    entry.consoleLogs.shift();
  }
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
  let spamInterval = null;
  let reconnectTimeout = null;

  const entry = {
    status: status,
    config: merged,
    _botInstance: bot,
    consoleLogs: [],
    hasRegistered: false
  };

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
      addConsoleLog(entry, 'error', 'Create failed: ' + e.message);
      console.error('[bot:' + name + '] Create failed:', e.message);
      scheduleReconnect(entry);
      return;
    }

    entry._botInstance = bot;
    addConsoleLog(entry, 'system', 'Connecting to ' + host + ':' + port + ' as ' + name);
    console.log('[bot:' + name + '] Connecting...');
    wireEvents(entry, bot);
  }

  function wireEvents(entry, botInstance) {
    botInstance.on('login', function () {
      status.connected = true;
      status.lastActivity = new Date().toISOString();
      status.error = null;
      addConsoleLog(entry, 'info', 'Logged in to server');
      console.log('[bot:' + name + '] Logged in');
    });

    botInstance.on('spawn', function () {
      status.lastActivity = new Date().toISOString();
      status.position = botInstance.entity
        ? { x: botInstance.entity.position.x, y: botInstance.entity.position.y, z: botInstance.entity.position.z }
        : status.position;
      startKeepalive(entry);
      startWander(entry);
      startJump(entry);
      startLook(entry);
      startSpam(entry);

      // Auto-chat on join
      if (merged.autoChatOnJoin) {
        setTimeout(function () {
          if (botInstance && botInstance.isChatAvailable() && status.loggedIn) {
            botInstance.chat(merged.autoChatOnJoin);
            addConsoleLog(entry, 'command', merged.autoChatOnJoin);
          }
        }, 3000);
      }

      // Auto register/login
      if (merged.autoLogin && merged.botPassword) {
        setTimeout(function () {
          if (botInstance && botInstance.isChatAvailable()) {
            if (!entry.hasRegistered) {
              botInstance.chat('/register ' + merged.botPassword + ' ' + merged.botPassword);
              entry.hasRegistered = true;
              addConsoleLog(entry, 'command', '/register **** ****');
              console.log('[bot:' + name + '] Sent /register');
            } else {
              botInstance.chat('/login ' + merged.botPassword);
              addConsoleLog(entry, 'command', '/login ****');
              console.log('[bot:' + name + '] Sent /login');
            }
            status.loggedIn = true;
          }
        }, merged.loginDelayMs);
      }

      addConsoleLog(entry, 'info', 'Spawned in world');
      console.log('[bot:' + name + '] Spawned');
    });

    botInstance.on('end', function () {
      status.connected = false;
      status.loggedIn = false;
      stopKeepalive(entry);
      stopWander(entry);
      stopJump(entry);
      stopLook(entry);
      stopSpam(entry);
      addConsoleLog(entry, 'system', 'Disconnected. Reconnecting...');
      console.log('[bot:' + name + '] Disconnected');
      scheduleReconnect(entry);
    });

    botInstance.on('error', function (err) {
      status.error = err.message;
      addConsoleLog(entry, 'error', err.message);
      console.error('[bot:' + name + '] Error:', err.message);
    });

    botInstance.on('chat', function (username, message) {
      if (username === name) return;
      status.lastActivity = new Date().toISOString();
      addConsoleLog(entry, 'chat', '<' + username + '> ' + message);

      if (merged.autoReply && Math.random() < merged.replyChance) {
        setTimeout(function () {
          if (botInstance && botInstance.isChatAvailable() && status.loggedIn) {
            const reply = getRandomReply();
            botInstance.chat(reply);
            addConsoleLog(entry, 'command', reply);
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

  function scheduleReconnect(entry) {
    if (entry._reconnectTimeout) clearTimeout(entry._reconnectTimeout);
    entry._reconnectTimeout = setTimeout(function () {
      if (bots.has(name)) {
        addConsoleLog(entry, 'system', 'Attempting reconnect...');
        console.log('[bot:' + name + '] Reconnecting...');
        createInstance();
      }
    }, merged.reconnectDelayMs);
  }

  function startKeepalive(entry) {
    if (!merged.keepalive || entry._keepaliveInterval) return;
    entry._keepaliveInterval = setInterval(function () {
      const botRef = entry._botInstance;
      if (botRef && botRef.isChatAvailable() && status.loggedIn) {
        botRef.chat('keepalive');
        status.lastActivity = new Date().toISOString();
      }
    }, merged.keepaliveIntervalMs);
  }

  function stopKeepalive(entry) {
    if (entry._keepaliveInterval) { clearInterval(entry._keepaliveInterval); entry._keepaliveInterval = null; }
  }

  function startWander(entry) {
    if (merged.mode !== 'wander' || entry._wanderInt) return;
    entry._wanderInt = setInterval(function () {
      if (!entry._botInstance || !entry._botInstance.entity) return;
      const pos = entry._botInstance.entity.position;
      const offset = new vec3((Math.random() - 0.5) * 8, 0, (Math.random() - 0.5) * 8);
      const target = pos.offset(offset);
      try {
        entry._botInstance.pathfinder.setGoal(new (require('mineflayer-pathfinder').GoalNear)(target.x, target.y, target.z, 1));
      } catch (e) { /* skip */ }
      status.position = { x: pos.x, y: pos.y, z: pos.z };
      status.lastActivity = new Date().toISOString();
    }, merged.wanderIntervalMs);
  }

  function stopWander(entry) {
    if (entry._wanderInt) { clearInterval(entry._wanderInt); entry._wanderInt = null; }
  }

  function startJump(entry) {
    if (merged.mode !== 'wander' || entry._jumpInt) return;
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

  function stopJump(entry) {
    if (entry._jumpInt) { clearInterval(entry._jumpInt); entry._jumpInt = null; }
    const botRef = entry._botInstance;
    if (botRef) {
      try { botRef.setControlState('jump', false); } catch (e) { /* skip */ }
    }
  }

  function startLook(entry) {
    if (merged.mode !== 'wander' || entry._lookInt) return;
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

  function stopLook(entry) {
    if (entry._lookInt) { clearInterval(entry._lookInt); entry._lookInt = null; }
  }

  function startSpam(entry) {
    if (!merged.spamMessage || entry._spamInt) return;
    entry._spamInt = setInterval(function () {
      const botRef = entry._botInstance;
      if (botRef && botRef.isChatAvailable() && status.loggedIn) {
        botRef.chat(merged.spamMessage);
        addConsoleLog(entry, 'command', merged.spamMessage);
      }
    }, merged.spamIntervalMs);
  }

  function stopSpam(entry) {
    if (entry._spamInt) { clearInterval(entry._spamInt); entry._spamInt = null; }
  }

  createInstance();

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
      position: entry.status.position,
      consoleLogs: entry.consoleLogs.slice(-20),
      autoChatOnJoin: entry.config.autoChatOnJoin,
      spamMessage: entry.config.spamMessage,
      spamIntervalMs: entry.config.spamIntervalMs
    });
  }
  return out;
}

function getBot(name) {
  const entry = bots.get(name);
  if (!entry) return null;
  return {
    ...entry.status,
    consoleLogs: entry.consoleLogs.slice(-50),
    autoChatOnJoin: entry.config.autoChatOnJoin,
    spamMessage: entry.config.spamMessage,
    spamIntervalMs: entry.config.spamIntervalMs
  };
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
  addConsoleLog(entry, 'system', 'Mode changed to ' + mode);

  if (mode === 'wander') {
    startWander(entry);
    startJump(entry);
    startLook(entry);
  } else {
    stopWander(entry);
    stopJump(entry);
    stopLook(entry);
  }
  return { name: name, mode: mode };
}

function botChat(name, message) {
  const entry = bots.get(name);
  if (!entry) throw new Error('Bot not found: ' + name);
  if (!entry.status.connected) {
    throw new Error('Bot not connected: ' + name);
  }
  const botRef = entry._botInstance;
  if (botRef && botRef.isChatAvailable()) {
    botRef.chat(message);
    entry.status.lastActivity = new Date().toISOString();
    addConsoleLog(entry, 'command', message);
    return { ok: true, sent: message };
  } else {
    throw new Error('Bot not ready for chat');
  }
}

function setAutoChat(name, message) {
  const entry = bots.get(name);
  if (!entry) throw new Error('Bot not found: ' + name);
  entry.config.autoChatOnJoin = message || null;
  addConsoleLog(entry, 'system', 'Auto-chat on join set to: ' + (message || 'none'));
  return { ok: true, autoChatOnJoin: entry.config.autoChatOnJoin };
}

function setSpam(name, message, intervalMs) {
  const entry = bots.get(name);
  if (!entry) throw new Error('Bot not found: ' + name);
  stopSpam(entry);
  entry.config.spamMessage = message || null;
  entry.config.spamIntervalMs = intervalMs || 30000;
  if (message) {
    startSpam(entry);
    addConsoleLog(entry, 'system', 'Spam enabled: "' + message + '" every ' + intervalMs + 'ms');
  } else {
    addConsoleLog(entry, 'system', 'Spam disabled');
  }
  return { ok: true, spamMessage: entry.config.spamMessage, spamIntervalMs: entry.config.spamIntervalMs };
}

module.exports = {
  createBot: createBot,
  listBots: listBots,
  getBot: getBot,
  removeBot: removeBot,
  setMode: setMode,
  botChat: botChat,
  setAutoChat: setAutoChat,
  setSpam: setSpam,
  getRandomName: getRandomName,
  DEFAULT_CONFIG: DEFAULT_CONFIG
};
