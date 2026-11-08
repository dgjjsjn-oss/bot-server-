const BASE = '';
let selectedMode = 'idle';

function setupModePills() {
  document.querySelectorAll('.mode-pill').forEach(function (pill) {
    pill.addEventListener('click', function () {
      document.querySelectorAll('.mode-pill').forEach(function (p) {
        p.classList.remove('active');
      });
      pill.classList.add('active');
      selectedMode = pill.getAttribute('data-mode');
      document.getElementById('summonMode').value = selectedMode;
    });
  });
}

function consoleClass(type) {
  switch (type) {
    case 'error': return 'error';
    case 'command': return 'command';
    case 'chat': return 'chat';
    case 'system': return 'system';
    default: return 'info';
  }
}

function formatTime(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleTimeString();
  } catch (e) {
    return iso;
  }
}

async function loadBots() {
  const res = await fetch(BASE + '/api/bots');
  const bots = await res.json();
  const list = document.getElementById('botList');
  list.innerHTML = '';
  if (bots.length === 0) {
    list.innerHTML = '<div class="empty">No bots yet. Summon one above.</div>';
    return;
  }
  for (const b of bots) {
    const item = document.createElement('div');
    item.className = 'bot-item';
    const dotClass = b.connected ? 'live' : 'dead';
    const statusText = b.connected ? 'online' : 'offline';
    const loginText = b.loggedIn ? ' • logged in' : b.connected ? ' • not logged in' : '';
    const pos = b.position ? (' • ' + Math.round(b.position.x) + ',' + Math.round(b.position.y) + ',' + Math.round(b.position.z)) : '';

    // Console logs HTML
    let logsHtml = '';
    if (b.consoleLogs && b.consoleLogs.length > 0) {
      logsHtml = b.consoleLogs.map(function (log) {
        return '<div class="console-line ' + consoleClass(log.type) + '">' +
          '<span class="console-time">[' + formatTime(log.time) + ']</span>' +
          escapeHtml(log.message) +
          '</div>';
      }).join('');
    }

    item.innerHTML =
      '<div class="bot-header">' +
      '<div>' +
      '<span class="bot-name">' + escapeHtml(b.name) + '</span>' +
      '<div class="bot-status ' + (b.connected ? 'status-ok' : 'status-bad') + '">' +
      '<span class="dot ' + dotClass + '"></span>' + statusText + loginText +
      ' • mode: ' + escapeHtml(b.mode) +
      ' • ' + b.host + ':' + b.port + pos +
      (b.lastActivity ? ' • last activity: ' + new Date(b.lastActivity).toLocaleString() : '') +
      (b.error ? ' • error: ' + escapeHtml(b.error) : '') +
      '</div>' +
      '</div>' +
      '</div>' +
      '<div class="controls">' +
      '<button class="secondary" onclick="setModeBot(\'' + escapeJs(b.name) + '\', \'idle\')">Idle</button>' +
      '<button class="secondary" onclick="setModeBot(\'' + escapeJs(b.name) + '\', \'wander\')">Wander</button>' +
      '<button class="danger" onclick="kickBot(\'' + escapeJs(b.name) + '\')">Kick</button>' +
      '</div>' +
      '<div class="console-box" id="console-' + escapeJs(b.name) + '">' + logsHtml + '</div>' +
      '<div class="chat-row">' +
      '<input type="text" id="chatInput-' + escapeJs(b.name) + '" placeholder="Type command or chat...">' +
      '<button onclick="sendChat(\'' + escapeJs(b.name) + '\')">Send</button>' +
      '</div>';
    list.appendChild(item);

    // Auto-scroll console to bottom
    const consoleBox = document.getElementById('console-' + escapeJs(b.name));
    if (consoleBox) consoleBox.scrollTop = consoleBox.scrollHeight;
  }
}

async function summonBot() {
  const name = document.getElementById('summonName').value.trim();
  const host = document.getElementById('summonHost').value.trim();
  const port = document.getElementById('summonPort').value.trim() || '29349';
  const mode = document.getElementById('summonMode').value;
  const pass = document.getElementById('summonPass').value.trim();
  const btn = document.getElementById('summonBtn');
  btn.disabled = true;
  btn.textContent = 'Summoning...';
  try {
    const res = await fetch(BASE + '/api/bots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name,
        host: host,
        port: port,
        mode: mode,
        botPassword: pass || null,
        autoLogin: pass ? true : false
      })
    });
    if (!res.ok) {
      const err = await res.json();
      alert(err.error || 'Failed to summon bot');
      return;
    }
    document.getElementById('summonName').value = '';
    document.getElementById('summonHost').value = '';
    document.getElementById('summonPort').value = '';
    document.getElementById('summonPass').value = '';
    loadBots();
  } catch (e) {
    alert('Request failed: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Summon bot';
  }
}

async function setModeBot(name, mode) {
  const res = await fetch(BASE + '/api/bots/' + encodeURIComponent(name) + '/mode', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: mode })
  });
  if (res.ok) loadBots();
  else alert('Failed to change mode');
}

async function kickBot(name) {
  if (!confirm('Remove bot ' + name + '?')) return;
  const res = await fetch(BASE + '/api/bots/' + encodeURIComponent(name), {
    method: 'DELETE'
  });
  if (res.ok) loadBots();
  else alert('Failed to kick bot');
}

async function sendChat(name) {
  const input = document.getElementById('chatInput-' + escapeJs(name));
  const message = input.value.trim();
  if (!message) return;
  input.disabled = true;
  try {
    const res = await fetch(BASE + '/api/bots/' + encodeURIComponent(name) + '/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: message })
    });
    if (!res.ok) {
      const err = await res.json();
      alert(err.error || 'Failed to send');
      return;
    }
    input.value = '';
  } catch (e) {
    alert('Request failed: ' + e.message);
  } finally {
    input.disabled = false;
  }
}

function escapeHtml(text) {
  if (!text) return '';
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeJs(text) {
  return String(text).replace(/'/g, "\\'").replace(/\\/g, '\\\\');
}

document.getElementById('summonBtn').addEventListener('click', summonBot);
setupModePills();
loadBots();
setInterval(loadBots, 5000);
