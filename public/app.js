const BASE = '';
let selectedMode = 'idle';
let serverHost = '';
let serverPort = '';
let botCards = {};
let isPolling = true;

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

function setupModePills() {
  document.querySelectorAll('.mode-pill').forEach(p => {
    p.addEventListener('click', function() {
      document.querySelectorAll('.mode-pill').forEach(x => x.classList.remove('active'));
      this.classList.add('active');
      selectedMode = this.getAttribute('data-mode');
      document.getElementById('summonMode').value = selectedMode;
    });
  });
}

function consoleClass(t) {
  return {error:'error', command:'command', chat:'chat', system:'system'}[t] || 'info';
}
function formatTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString();
}

async function loadConfig() {
  try {
    const r = await fetch(BASE + '/api/config');
    const c = await r.json();
    serverHost = c.host || ''; serverPort = c.port || '';
    const h = document.getElementById('dashHost'); const p = document.getElementById('dashPort');
    if (h) h.textContent = serverHost || 'Not configured';
    if (p) p.textContent = serverPort || 'Not configured';
    // Auto-fill test fields
    const th = document.getElementById('testHost'); const tp = document.getElementById('testPort');
    if (th && serverHost) th.value = serverHost;
    if (tp && serverPort) tp.value = serverPort;
  } catch(e) { console.error('config load failed', e); }
}

async function testConnection() {
  const h = document.getElementById('testHost').value.trim() || serverHost;
  const p = document.getElementById('testPort').value.trim() || serverPort || '25565';
  const btn = document.getElementById('testBtn');
  const result = document.getElementById('testResult');
  btn.disabled = true; btn.textContent = 'Testing...';
  result.style.display = 'block';
  result.innerHTML = '<div class="console-line system">Testing connection to ' + h + ':' + p + '...</div>';
  try {
    const resp = await fetch(BASE + '/api/test-connection', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ host: h, port: p })
    });
    const data = await resp.json();
    if (data.ok) {
      result.innerHTML = '<div class="console-line command">✓ CONNECTED to ' + data.host + ':' + data.port + '</div><div class="console-line info">Response: ' + (data.result || 'OK') + '</div>';
    } else {
      result.innerHTML = '<div class="console-line error">✗ FAILED to connect to ' + data.host + ':' + data.port + '</div><div class="console-line error">Error: ' + data.error + '</div>';
    }
  } catch(e) {
    result.innerHTML = '<div class="console-line error">✗ REQUEST FAILED: ' + e.message + '</div>';
  }
  btn.disabled = false; btn.textContent = 'Test Connection';
}

function escapeHtml(t){if(!t)return'';return t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function escapeJs(t){return String(t).replace(/'/g,"\\'").replace(/\\/g,'\\\\');}

function createBotCardHTML(b) {
  const live = b.connected;
  const dotClass = live ? 'live' : 'dead';
  const statusText = live ? 'online' : 'offline';
  const login = b.loggedIn ? ' • logged in' : live ? ' • not logged in' : '';
  const pos = b.position ? ' • ' + Math.round(b.position.x)+','+Math.round(b.position.y)+','+Math.round(b.position.z) : '';
  let logs = '';
  if (b.consoleLogs && b.consoleLogs.length) {
    logs = b.consoleLogs.slice(-6).map(l =>
      '<div class="console-line '+consoleClass(l.type)+'"><span class="console-time">['+formatTime(l.time)+']</span>'+escapeHtml(l.message)+'</div>'
    ).join('');
  }
  return `
    <div class="bot-card ${live?'connected':''}" id="bot-card-${escapeJs(b.name)}">
      <div class="bot-header">
        <div><div class="bot-name">${escapeHtml(b.name)}</div><div class="bot-meta">${escapeHtml(b.host)}:${b.port}${pos}</div></div>
        <div class="bot-status ${live?'connected':''}"><div class="dot ${dotClass}"></div>${statusText}${login}</div>
      </div>
      <div class="controls-row">
        <button class="btn btn-sm btn-secondary" onclick="setModeBot('${escapeJs(b.name)}','idle')">Idle</button>
        <button class="btn btn-sm btn-secondary" onclick="setModeBot('${escapeJs(b.name)}','wander')">Wander</button>
        <button class="btn btn-sm btn-danger" onclick="kickBot('${escapeJs(b.name)}')">Kick</button>
      </div>
      <div class="feature-section">
        <h3>Send Command / Chat</h3>
        <div class="input-row">
          <input type="text" id="chatInput-${escapeJs(b.name)}" placeholder="Type anything...">
          <button class="btn btn-sm btn-primary" onclick="sendChat('${escapeJs(b.name)}')">Send</button>
        </div>
      </div>
      <div class="feature-section">
        <h3>Auto-Chat on Join</h3>
        <div class="input-row">
          <input type="text" id="autoChatInput-${escapeJs(b.name)}" placeholder="Message on spawn...">
          <button class="btn btn-sm btn-primary" onclick="setAutoChat('${escapeJs(b.name)}')">Set</button>
        </div>
      </div>
      <div class="feature-section">
        <h3>Spam / Repeat</h3>
        <div class="input-row">
          <input type="text" id="spamInput-${escapeJs(b.name)}" placeholder="Message...">
          <input type="number" id="spamInterval-${escapeJs(b.name)}" placeholder="ms" value="30000" style="width:80px;">
          <button class="btn btn-sm btn-warning" onclick="setSpam('${escapeJs(b.name)}')">Set Spam</button>
        </div>
      </div>
      <div class="feature-section">
        <h3>Live Console</h3>
        <div class="console-box" id="console-${escapeJs(b.name)}">${logs||'<div class="console-line system">No logs yet...</div>'}</div>
      </div>
    </div>
  `;
}

async function loadBots() {
  try {
    const r = await fetch(BASE + '/api/bots');
    const bots = await r.json();
    const list = document.getElementById('botList');
    const current = new Set();
    if (bots.length === 0) {
      if (!list.children[0] || !list.children[0].classList.contains('empty-state')) {
        list.innerHTML = '<div class="empty-state"><div class="icon">🤖</div><p>No bots yet. Summon your first bot.</p></div>';
      }
      botCards = {}; return;
    }
    if (list.children[0] && list.children[0].classList.contains('empty-state')) list.innerHTML = '';
    for (const b of bots) {
      current.add(b.name);
      const cid = 'bot-card-'+escapeJs(b.name);
      if (!botCards[b.name]) {
        const d = document.createElement('div'); d.innerHTML = createBotCardHTML(b);
        list.appendChild(d.firstElementChild);
        botCards[b.name] = document.getElementById(cid);
      } else {
        const c = botCards[b.name];
        const pos = b.position ? ' • '+Math.round(b.position.x)+','+Math.round(b.position.y)+','+Math.round(b.position.z) : '';
        const ne = c.querySelector('.bot-name'); const me = c.querySelector('.bot-meta');
        const se = c.querySelector('.bot-status');
        if (ne) ne.textContent = escapeHtml(b.name);
        if (me) me.textContent = b.host+':'+b.port+pos;
        const login = b.loggedIn ? ' • logged in' : b.connected ? ' • not logged in' : '';
        if (se) {
          se.className = 'bot-status '+(b.connected?'connected':'');
          se.innerHTML = '<div class="dot '+(b.connected?'live':'dead')+'"></div>'+(b.connected?'online':'offline')+login;
        }
        const cb = c.querySelector('#console-'+escapeJs(b.name));
        if (cb && b.consoleLogs && b.consoleLogs.length) {
          const nl = b.consoleLogs.slice(-6).map(l =>
            '<div class="console-line '+consoleClass(l.type)+'"><span class="console-time">['+formatTime(l.time)+']</span>'+escapeHtml(l.message)+'</div>'
          ).join('');
          if (cb.innerHTML !== nl) { cb.innerHTML = nl; cb.scrollTop = cb.scrollHeight; }
        }
      }
    }
    for (const n of Object.keys(botCards)) if (!current.has(n)) { botCards[n].remove(); delete botCards[n]; }
  } catch(e) { console.error('loadBots error', e); }
}

async function summonBot() {
  const name = document.getElementById('summonName').value.trim();
  const pass = document.getElementById('summonPass').value.trim();
  const mode = document.getElementById('summonMode').value;
  const btn = document.getElementById('summonBtn');
  btn.disabled = true; btn.textContent = 'Summoning...';
  try {
    const r = await fetch(BASE + '/api/bots', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({name, host:serverHost||undefined, port:serverPort||undefined, mode, botPassword:pass||null, autoLogin:pass?true:false})
    });
    if (!r.ok) { const e = await r.json(); alert(e.error||'Failed'); return; }
    document.getElementById('summonName').value=''; document.getElementById('summonPass').value='';
    loadBots();
  } catch(e) { alert('Failed: '+e.message); } finally { btn.disabled=false; btn.textContent='Summon Bot'; }
}

async function setModePill(el, m) {
  document.querySelectorAll('.mode-pill').forEach(p => p.classList.remove('active'));
  el.classList.add('active');
  selectedMode = m;
  document.getElementById('summonMode').value = m;
}

async function setModeBot(n, m) {
  const r = await fetch(BASE + '/api/bots/'+encodeURIComponent(n)+'/mode', {method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:m})});
  if (r.ok) loadBots(); else alert('Failed');
}
async function kickBot(n) {
  if(!confirm('Remove '+n+'?')) return;
  const r = await fetch(BASE + '/api/bots/'+encodeURIComponent(n), {method:'DELETE'});
  if (r.ok) loadBots(); else alert('Failed');
}
async function sendChat(n) {
  const i = document.getElementById('chatInput-'+escapeJs(n)); const m = i.value.trim();
  if(!m) return; i.disabled=true;
  try {
    const r = await fetch(BASE + '/api/bots/'+encodeURIComponent(n)+'/chat', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:m})});
    if(!r.ok){const e=await r.json(); alert(e.error||'Failed'); return;}
    i.value='';
  }catch(e){alert('Failed: '+e.message);} finally{i.disabled=false;}
}
async function setAutoChat(n) {
  const i = document.getElementById('autoChatInput-'+escapeJs(n)); const m=i.value.trim();
  if(!m) return; i.disabled=true;
  try {
    const r = await fetch(BASE + '/api/bots/'+encodeURIComponent(n)+'/autochat', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:m})});
    if(!r.ok){const e=await r.json(); alert(e.error||'Failed'); return;}
    i.value=''; loadBots();
  }catch(e){alert('Failed: '+e.message);} finally{i.disabled=false;}
}
async function setSpam(n) {
  const i = document.getElementById('spamInput-'+escapeJs(n)); const iv = document.getElementById('spamInterval-'+escapeJs(n));
  const m=i.value.trim(); const ms=parseInt(iv.value)||30000;
  if(!m) return; i.disabled=true; iv.disabled=true;
  try {
    const r = await fetch(BASE + '/api/bots/'+encodeURIComponent(n)+'/spam', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:m, intervalMs:ms})});
    if(!r.ok){const e=await r.json(); alert(e.error||'Failed'); return;}
    i.value=''; loadBots();
  }catch(e){alert('Failed: '+e.message);} finally{i.disabled=false; iv.disabled=false;}
}
async function bulkSummon() {
  const count = document.getElementById('bulkCount').value.trim();
  const prefix = document.getElementById('bulkPrefix').value.trim()||'Bot';
  const pass = document.getElementById('bulkPass').value.trim();
  const rn = document.getElementById('bulkRandom').checked;
  const mode = window.bulkMode || selectedMode || 'wander';
  const btn = document.getElementById('bulkBtn');
  const progress = document.getElementById('bulkProgress');
  const progressBar = document.getElementById('bulkProgressBar');
  const progressText = document.getElementById('bulkProgressText');
  btn.disabled=true; btn.textContent='Summoning...';
  progress.style.display='block';
  progressBar.style.width='0%';
  progressText.textContent='Connecting all bots...';
  try {
    const r = await fetch(BASE + '/api/bots/bulk', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({count, prefix, mode, botPassword:pass||null, autoLogin:pass?true:false, randomNames:rn})});
    if(!r.ok){const e=await r.json(); alert(e.error||'Bulk failed'); progress.style.display='none'; return;}
    const d=await r.json();
    progressBar.style.width='100%';
    progressText.textContent='Summoned '+d.summoned+'/'+d.requested+' bots'+(d.errors.length?' ('+d.errors.length+' failed)':'');
    alert('Summoned '+d.summoned+'/'+d.requested+' bots'+(d.errors.length?' ('+d.errors.length+' failed)':''));
    loadBots();
  }catch(e){alert('Failed: '+e.message);} finally{
    btn.disabled=false; btn.textContent='Bulk Summon Bots';
    setTimeout(()=>{progress.style.display='none';}, 2000);
  }
}

document.getElementById('summonBtn').addEventListener('click', summonBot);
setupModePills();
loadConfig();
loadBots();
setInterval(loadBots, 5000);