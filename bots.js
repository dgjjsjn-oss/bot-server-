const mineflayer = require('mineflayer');
const { vec3 } = require('vec3');

const bots = new Map();

const DEFAULT_CONFIG = {
  mode: 'wander',
  keepalive: true,
  keepaliveIntervalMs: 120000,
  wanderIntervalMs: 10000,
  jumpIntervalMs: 15000,
  lookIntervalMs: 5000,
  maxBots: 99,
  autoLogin: true,
  botPassword: null,
  loginDelayMs: 8000,
  reconnectDelayMs: 5000,
  version: false,
  autoReply: true,
  replyChance: 0.6,
  maxConsoleLogs: 100,
  autoChatOnJoin: null,
  spamMessage: null,
  spamIntervalMs: 30000,
  staggerDelayMs: 500,
  randomBehavior: true,
  connectTimeoutMs: 15000
};

const RANDOM_NAMES = [
  "wembo","Player1","Noob","ProGamer","XxSlayer","Bot99","Creeper","Steve","Alex",
  "Herobrine","Notch","Ghost","Ninja","Shadow","Viper","Blaze","Frost","Ember",
  "Storm","Zenith","Nova","Orbit","Pixel","Glitch","Zephyr","Koda","Rex","Luna",
  "Atlas","Kairo","Jax","Zara","Milo","Ivy","Ace","Ryder","Kai","Sora","Hana",
  "Ren","Yuki","Haruto","Mina","Eli","Zoe","Leo","Maya","Owen","Iris","Haruto",
  "Finn","Aria","Liam","Ella","Noah","Ava","Lucas","Mia","Ethan","Sofia","James",
  "Amelia","Oliver","Charlotte","William","Isabella","Henry","Theodore","Luna",
  "Jack","Scarlett","Charlie","Ruby","Harry","Grace","George","Olive","Freddie",
  "Rosie","Albie","Ivy","Teddy","Poppy","Arthur","Daisy","Muhammad","Amelia",
  "Noah","Olivia","Leo","Ava","Oscar","Mia","Arthur","Isla","Henry","Sophia",
  "Freddie","Grace","Charlie","Lily","Albie","Grace","Theo","Emilia","Archie",
  "Sienna","Henry","Elsie","Jack","Maya","Leo","Aria"
];

function getRandomName() {
  return RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)] + '_' + Math.floor(Math.random() * 9999);
}

function getRandomDelay(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

const SMART_REPLIES = [
  { match: /where/i, reply: ["im not sure", "around spawn", "check the map", "idk where"] },
  { match: /who/i, reply: ["just a player", "im a bot", "idk who", "a random player"] },
  { match: /what/i, reply: ["idk", "nothing much", "just playing", "minecraft stuff"] },
  { match: /how/i, reply: ["just walk", "press w", "use keyboard", "idk how"] },
  { match: /when/i, reply: ["soon", "later", "idk when", "maybe tomorrow"] },
  { match: /why/i, reply: ["just because", "idk why", "for fun", "why not"] },
  { match: /can/i, reply: ["maybe", "idk", "try it", "i cant"] },
  { match: /yes|yeah|yep/i, reply: ["ok", "cool", "nice", "nice one"] },
  { match: /no|nope|nah/i, reply: ["ok", "fair enough", "sad", "understandable"] },
  { match: /gg|good game/i, reply: ["gg", "wp", "good game", "gg wp"] },
  { match: /haha|lol|hehe/i, reply: ["lol", "haha", "funny", "nice"] },
  { match: /bye|goodbye|cya/i, reply: ["bye", "cya", "see ya", "later"] },
  { match: /afk/i, reply: ["ok afk", "np", "take your time", "np"] }
];

const AUTO_REPLIES = [
  "yo", "hi", "hello", "sup", "im just playing", "cool server", "nice",
  "lol", "haha", "im afk for a sec", "brb", "gg", "wp", "good game",
  "lets go", "im here", "what?", "where?", "aaa", "omg", "nice server",
  "playing minecraft", "just joined", "wow", "epic"
];

function smartReply(message) {
  const msg = message.toLowerCase();
  for (const q of SMART_REPLIES) {
    if (q.match.test(msg)) {
      return q.reply[Math.floor(Math.random() * q.reply.length)];
    }
  }
  return null;
}

function getRandomReply() {
  return AUTO_REPLIES[Math.floor(Math.random() * AUTO_REPLIES.length)];
}

function addConsoleLog(entry, type, message) {
  const log = { time: new Date().toISOString(), type, message };
  entry.consoleLogs.push(log);
  if (entry.consoleLogs.length > entry.config.maxConsoleLogs) entry.consoleLogs.shift();
}

function createBot(name, host, port, config = {}) {
  if (bots.has(name)) throw new Error('Bot already exists: ' + name);
  if (bots.size >= (config.maxBots || DEFAULT_CONFIG.maxBots)) {
    throw new Error('Bot limit reached (' + (config.maxBots || DEFAULT_CONFIG.maxBots) + '). Remove a bot first.');
  }

  const merged = Object.assign({}, DEFAULT_CONFIG, config);
  const status = {
    name, connected: false, host, port, mode: merged.mode,
    lastActivity: null, error: null, position: {x:0,y:0,z:0}, loggedIn: false
  };

  let bot = null, keepaliveInterval=null, wanderInterval=null, jumpInterval=null;
  let lookInterval=null, spamInterval=null, reconnectTimeout=null, connectTimeout=null;
  const entry = { status, config: merged, _botInstance: bot, consoleLogs: [], hasRegistered: false, loginAttempted: false };

  function createInstance() {
    try {
      bot = mineflayer.createBot({
        host: host,
        port: port,
        username: name,
        version: false
      });
    } catch(e) {
      status.error = e.message;
      addConsoleLog(entry, 'error', 'Create failed: ' + e.message);
      console.error('[bot:' + name + '] Create failed:', e.message);
      scheduleReconnect(entry);
      return;
    }
    entry._botInstance = bot;
    addConsoleLog(entry, 'system', 'Connecting to ' + host + ':' + port + ' as ' + name);
    console.log('[bot:' + name + '] Connecting to ' + host + ':' + port);

    connectTimeout = setTimeout(() => {
      if (bot && !status.connected) {
        addConsoleLog(entry, 'error', 'Connection timed out - server may be offline or blocking');
        console.error('[bot:' + name + '] Connection timed out');
        try { bot.end(); } catch(e) {}
        scheduleReconnect(entry);
      }
    }, merged.connectTimeoutMs);

    wireEvents(entry, bot);
  }

  function wireEvents(entry, botInstance) {
    botInstance.on('login', () => {
      if (connectTimeout) { clearTimeout(connectTimeout); connectTimeout = null; }
      status.connected = true; status.lastActivity = new Date().toISOString(); status.error = null;
      addConsoleLog(entry, 'info', 'Logged in to server');
      console.log('[bot:' + name + '] Logged in');
    });

    botInstance.on('spawn', () => {
      status.lastActivity = new Date().toISOString();
      status.position = botInstance.entity ? {x:botInstance.entity.position.x,y:botInstance.entity.position.y,z:botInstance.entity.position.z} : status.position;
      startKeepalive(entry); startWander(entry); startJump(entry); startLook(entry); startSpam(entry);

      if (merged.autoChatOnJoin) {
        setTimeout(() => { if(botInstance&&botInstance.isChatAvailable()&&status.loggedIn){ botInstance.chat(merged.autoChatOnJoin); addConsoleLog(entry,'command',merged.autoChatOnJoin); }}, 5000);
      }

      if (merged.autoLogin && merged.botPassword) {
        const loginDelay = merged.loginDelayMs + getRandomDelay(0, 3000);
        setTimeout(() => {
          if(botInstance&&botInstance.isChatAvailable()&&!entry.loginAttempted) {
            entry.loginAttempted = true;
            if(!entry.hasRegistered){ 
              botInstance.chat('/register '+merged.botPassword+' '+merged.botPassword); 
              entry.hasRegistered=true; 
              addConsoleLog(entry,'command','/register **** ****'); 
            } else { 
              botInstance.chat('/login '+merged.botPassword); 
              addConsoleLog(entry,'command','/login ****'); 
            }
            status.loggedIn = true;
          }
        }, loginDelay);
      }
      addConsoleLog(entry, 'info', 'Spawned in world');
    });

    botInstance.on('end', () => {
      if (connectTimeout) { clearTimeout(connectTimeout); connectTimeout = null; }
      status.connected=false; status.loggedIn=false; entry.loginAttempted = false;
      stopKeepalive(entry); stopWander(entry); stopJump(entry); stopLook(entry); stopSpam(entry);
      addConsoleLog(entry, 'system', 'Disconnected. Reconnecting in 5s...');
      console.log('[bot:' + name + '] Disconnected');
      scheduleReconnect(entry);
    });

    botInstance.on('error', (err) => {
      if (connectTimeout) { clearTimeout(connectTimeout); connectTimeout = null; }
      status.error = err.message;
      addConsoleLog(entry,'error',err.message);
      console.error('[bot:' + name + '] Error:', err.message);
    });

    botInstance.on('chat', (username, message) => {
      if(username===name) return;
      status.lastActivity = new Date().toISOString();
      addConsoleLog(entry, 'chat', '<'+username+'> '+message);

      if(merged.autoLogin && merged.botPassword && !entry.hasRegistered) {
        const lower = message.toLowerCase();
        if(lower.includes('register') || lower.includes('login') || lower.includes('password') || lower.includes('please register') || lower.includes('please login')) {
          addConsoleLog(entry, 'system', 'Detected login prompt from server');
          setTimeout(() => {
            if(botInstance&&botInstance.isChatAvailable()&&!entry.loginAttempted) {
              entry.loginAttempted = true;
              botInstance.chat('/register '+merged.botPassword+' '+merged.botPassword);
              entry.hasRegistered = true;
              addConsoleLog(entry, 'command', '/register **** **** (auto-detected)');
              status.loggedIn = true;
            }
          }, 2000);
        }
      }

      if(merged.autoReply) {
        const s = smartReply(message);
        const reply = s || (Math.random() < merged.replyChance ? getRandomReply() : null);
        if(reply) {
          setTimeout(() => {
            if(botInstance&&botInstance.isChatAvailable()&&status.loggedIn){ botInstance.chat(reply); addConsoleLog(entry,'command',reply); }
          }, 2000 + Math.random() * 4000);
        }
      }
    });

    botInstance.on('update_health', () => {
      if(botInstance.entity) status.position = {x:botInstance.entity.position.x,y:botInstance.entity.position.y,z:botInstance.entity.position.z};
    });
  }

  function scheduleReconnect(entry) {
    if(entry._reconnectTimeout) clearTimeout(entry._reconnectTimeout);
    entry._reconnectTimeout = setTimeout(() => { if(bots.has(name)) createInstance(); }, merged.reconnectDelayMs);
  }

  function startKeepalive(entry){ if(!merged.keepalive||entry._keepaliveInterval)return; entry._keepaliveInterval=setInterval(()=>{const b=entry._botInstance;if(b&&b.isChatAvailable()&&status.loggedIn){b.chat('keepalive');status.lastActivity=new Date().toISOString();}},merged.keepaliveIntervalMs); }
  function stopKeepalive(e){if(e._keepaliveInterval){clearInterval(e._keepaliveInterval);e._keepaliveInterval=null;}}

  function startWander(entry){
    if(merged.mode!=='wander'||entry._wanderInt)return;
    entry._wanderInt=setInterval(()=>{
      const b=entry._botInstance;
      if(!b||!b.entity)return;
      const players = Object.values(b.players).filter(p => p.entity && p.entity.position);
      const myPos = b.entity.position;
      let nearest = null; let nearestDist = 9999;
      for (const pl of players) {
        const d = myPos.distanceTo(pl.entity.position);
        if (d < nearestDist) { nearestDist = d; nearest = pl; }
      }
      if (nearest && nearestDist < 15) {
        try { b.lookAt(nearest.entity.position.offset(0,1.6,0)); } catch(e){}
        if (nearestDist > 4 && Math.random() < 0.3) {
          try { b.pathfinder.setGoal(new(require('mineflayer-pathfinder').GoalNear)(nearest.entity.position.x, nearest.entity.position.y, nearest.entity.position.z, 2)); } catch(e){}
          addConsoleLog(entry, 'info', 'Following player ' + nearest.username);
        }
        status.position = {x:myPos.x,y:myPos.y,z:myPos.z};
        status.lastActivity = new Date().toISOString();
        return;
      }
      const p=b.entity.position;
      const o=new vec3((Math.random()-0.5)*8,0,(Math.random()-0.5)*8);
      const t=p.offset(o);
      try{b.pathfinder.setGoal(new(require('mineflayer-pathfinder').GoalNear)(t.x,t.y,t.z,1));}catch(e){}
      status.position={x:p.x,y:p.y,z:p.z};
      status.lastActivity=new Date().toISOString();
    },merged.wanderIntervalMs);
  }
  function stopWander(e){if(e._wanderInt){clearInterval(e._wanderInt);e._wanderInt=null;}}

  function startJump(entry){
    if(merged.mode!=='wander'||entry._jumpInt)return;
    entry._jumpInt=setInterval(()=>{
      const b=entry._botInstance;
      if(!b||!b.entity)return;
      try{b.setControlState('jump',true);setTimeout(()=>{if(b)b.setControlState('jump',false);},500);}catch(e){}
    },merged.jumpIntervalMs);
  }
  function stopJump(e){if(e._jumpInt){clearInterval(e._jumpInt);e._jumpInt=null;}const b=e._botInstance;if(b)try{b.setControlState('jump',false);}catch(e){}}

  function startLook(entry){
    if(merged.mode!=='wander'||entry._lookInt)return;
    entry._lookInt=setInterval(()=>{
      const b=entry._botInstance;
      if(!b||!b.entity)return;
      try{b.look(Math.random()*Math.PI*2,(Math.random()-0.5)*Math.PI,true);}catch(e){}
    },merged.lookIntervalMs);
  }
  function stopLook(e){if(e._lookInt){clearInterval(e._lookInt);e._lookInt=null;}}

  function startSpam(entry){
    if(!merged.spamMessage||entry._spamInt)return;
    entry._spamInt=setInterval(()=>{
      const b=entry._botInstance;
      if(b&&b.isChatAvailable()&&status.loggedIn){b.chat(merged.spamMessage);addConsoleLog(entry,'command',merged.spamMessage);}
    },merged.spamIntervalMs);
  }
  function stopSpam(e){if(e._spamInt){clearInterval(e._spamInt);e._spamInt=null;}}

  createInstance();
  bots.set(name, entry);
  return status;
}

function listBots(){
  const out=[];
  for(const [name,entry] of bots.entries()){
    out.push({name:entry.status.name,connected:entry.status.connected,loggedIn:entry.status.loggedIn,host:entry.status.host,port:entry.status.port,mode:entry.status.mode,lastActivity:entry.status.lastActivity,error:entry.status.error,position:entry.status.position,consoleLogs:entry.consoleLogs.slice(-20),autoChatOnJoin:entry.config.autoChatOnJoin,spamMessage:entry.config.spamMessage,spamIntervalMs:entry.config.spamIntervalMs});
  }
  return out;
}
function getBot(name){const e=bots.get(name);if(!e)return null;return {...e.status,consoleLogs:e.consoleLogs.slice(-50),autoChatOnJoin:e.config.autoChatOnJoin,spamMessage:e.config.spamMessage,spamIntervalMs:e.config.spamIntervalMs};}
function removeBot(name){const e=bots.get(name);if(!e)return false;try{if(e._botInstance)e._botInstance.end();}catch(e){}bots.delete(name);return true;}
function setMode(name,mode){const e=bots.get(name);if(!e)throw new Error('Bot not found');if(mode!=='idle'&&mode!=='wander'&&mode!=='chat')throw new Error('Invalid mode');e.status.mode=mode;e.config.mode=mode;addConsoleLog(e,'system','Mode '+mode);if(mode==='wander'){startWander(e);startJump(e);startLook(e);}else{stopWander(e);stopJump(e);stopLook(e);}return {name,mode};}
function botChat(name,message){const e=bots.get(name);if(!e)throw new Error('Bot not found');if(!e.status.connected)throw new Error('Not connected');const b=e._botInstance;if(b&&b.isChatAvailable()){b.chat(message);e.status.lastActivity=new Date().toISOString();addConsoleLog(e,'command',message);return{ok:true,sent:message};}throw new Error('Not ready');}
function setAutoChat(name,message){const e=bots.get(name);if(!e)throw new Error('Bot not found');e.config.autoChatOnJoin=message||null;addConsoleLog(e,'system','Auto-chat: '+(message||'none'));return{ok:true,autoChatOnJoin:e.config.autoChatOnJoin};}
function setSpam(name,message,intervalMs){const e=bots.get(name);if(!e)throw new Error('Bot not found');stopSpam(e);e.config.spamMessage=message||null;e.config.spamIntervalMs=intervalMs||30000;if(message){startSpam(e);addConsoleLog(e,'system','Spam: '+message+' every '+intervalMs+'ms');}else{addConsoleLog(e,'system','Spam disabled');}return{ok:true,spamMessage:e.config.spamMessage,spamIntervalMs:e.config.spamIntervalMs};}

module.exports={createBot,listBots,getBot,removeBot,setMode,botChat,setAutoChat,setSpam,getRandomName,DEFAULT_CONFIG};