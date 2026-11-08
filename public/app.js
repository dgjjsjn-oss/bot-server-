const BASE = '';
let selectedMode = 'idle';
let serverHost = '';
let serverPort = '';
let botCards = {}; // name -> card DOM element

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

async function loadConfig() {
  try {
    const res = await fetch(BASE + '/api/config');
    const cfg = await res.json();
    serverHost = cfg.host || '';
    serverPort = cfg.port || '';
    const hostEl = document.getElementById('dashHost');
    const portEl = document.getElementById('dashPort');
    if (hostEl) hostEl.textContent = serverHost || 'Not configured';
    if (portEl) portEl.textContent = serverPort || 'Not configured';
  } catch (e) {
    console.error('Failed to load config:', e);
  }
}

function escapeHtml(text) {
  if (!text) return '';
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeJs(text) {
  return String(text).replace(/'/g, "\\'").replace(/\\/g, '\\\\');
}

function createBotCardHTML(b) {
  const dotClass = b.connected ? 'live' : 'dead';
  const statusText = b.connected ? 'online' : 'offline';
  const loginText = b.loggedIn ? ' • logged in' : b.connected ? ' • not logged in' : '';
  const pos = b.position ? ' • ' + Math.round(b.position.x) + ',' + Math.round(b.position.y) + ',' + Math.round(b.position.z) : '';

  let logsHtml = '';
  if (b.consoleLogs && b.consoleLogs.length > 0) {
    logsHtml = b.consoleLogs.slice(-10).map(function (log) {
      return '<div class="console-line ' + consoleClass(log.type) + '">' +
        '<span class="console-time">[' + formatTime(log.time) + ']</span>' +
        escapeHtml(log.message) +
        '</div>';
    }).join('');
  }

  return `
    <div class="bot-card ${b.connected ? 'connected' : ''}" id="bot-card-${escapeJs(b.name)}">
      <div class="bot-header">
        <div>
          <div class="bot-name">${escapeHtml(b.name)}</div>
          <div class="bot-meta">${escapeHtml(b.host)}:${b.port} ${pos}</div>
        </div>
        <div class="bot-status ${b.connected ? 'connected' : ''}">
          <div class="dot ${dotClass}"></div>
          ${statusText}${loginText}
        </div>
      </div>

      <div class="controls-row">
        <button class="btn btn-sm btn-secondary" onclick="setModeBot('${escapeJs(b.name)}', 'idle')">Idle</button>
        <button class="btn btn-sm btn-secondary" onclick="setModeBot('${escapeJs(b.name)}', 'wander')">Wander</button>
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
          <input type="text" id="autoChatInput-${escapeJs(b.name)}" placeholder="Message to send on spawn...">
          <button class="btn btn-sm btn-primary" onclick="setAutoChat('${escapeJs(b.name)}')">Set</button>
        </div>
      </div>

      <div class="feature-section">
        <h3>Spam / Repeat</h3>
        <div class="input-row">
          <input type="text" id="spamInput-${escapeJs(b.name)}" placeholder="Message to repeat...">
          <input type="number" id="spamInterval-${escapeJs(b.name)}" placeholder="ms" value="30000" style="width:80px;">
          <button class="btn btn-sm btn-warning" onclick="setSpam('${escapeJs(b.name)}')">Set Spam</button>
        </div>
      </div>

      <div class="feature-section">
        <h3>Live Console</h3>
        <div class="console-box" id="console-${escapeJs(b.name)}">${logsHtml || '<div class="console-line system">No logs yet...</div>'}</div>
      </div>
    </div>
  `;
}

async function loadBots() {
  const res = await fetch(BASE + '/api/bots');
  const bots = await res.json();
  const list = document.getElementById('botList');
  const currentNames = new Set();

  if (bots.length === 0) {
    if (list.children.length === 0 || (list.children[0] && list.children[0].classList.contains('empty-state'))) {
      list.innerHTML = `
        <div class="empty-state">
          <div class="icon">🤖</div>
          <p>No bots yet. Summon your first bot above.</p>
        </div>
      `;
    }
    botCards = {};
    return;
  }

  if (list.children[0] && list.children[0].classList.contains('empty-state')) {
    list.innerHTML = '';
  }

  for (const b of bots) {
    currentNames.add(b.name);
    const cardId = 'bot-card-' + escapeJs(b.name);

    if (!botCards[b.name]) {
      const div = document.createElement('div');
      div.innerHTML = createBotCardHTML(b);
      const card = div.firstElementChild;
      list.appendChild(card);
      botCards[b.name] = card;
    } else {
      const card = botCards[b.name];
      const nameEl = card.querySelector('.bot-name');
      const metaEl = card.querySelector('.bot-meta');
      const statusEl = card.querySelector('.bot-status');
      const dotEl = statusEl ? statusEl.querySelector('.dot') : null;
      const pos = b.position ? ' • ' + Math.round(b.position.x) + ',' + Math.round(b.position.y) + ',' + Math.round(b.position.z) : '';

      if (nameEl) nameEl.textContent = escapeHtml(b.name);
      if (metaEl) metaEl.textContent = b.host + ':' + b.port + pos;

      const loginText = b.loggedIn ? ' • logged in' : b.connected ? ' • not logged in' : '';
      if (statusEl) {
        statusEl.className = 'bot-status ' + (b.connected ? 'connected' : '');
        statusEl.innerHTML = '<div class="dot ' + (b.connected ? 'live' : 'dead') + '"></div>' +
          (b.connected ? 'online' : 'offline') + loginText;
      }

      const consoleBox = card.querySelector('#console-' + escapeJs(b.name));
      if (consoleBox && b.consoleLogs && b.consoleLogs.length > 0) {
        const newLogs = b.consoleLogs.slice(-10).map(function (log) {
          return '<div class="console-line ' + consoleClass(log.type) + '">' +
            '<span class="console-time">[' + formatTime(log.time) + ']</span>' +
            escapeHtml(log.message) +
            '</div>';
        }).join('');
        if (consoleBox.innerHTML !== newLogs) {
          consoleBox.innerHTML = newLogs;
          consoleBox.scrollTop = consoleBox.scrollHeight;
        }
      }
    }
  }

  for (const name of Object.keys(botCards)) {
    if (!currentNames.has(name)) {
      botCards[name].remove();
      delete botCards[name];
    }
  }
}

async function summonBot() {
  const name = document.getElementById('summonName').value.trim();
  const pass = document.getElementById('summonPass').value.trim();
  const mode = document.getElementById('summonMode').value;
  const btn = document.getElementById('summonBtn');
  btn.disabled = true;
  btn.textContent = 'Summoning...';
  try {
    const res = await fetch(BASE + '/api/bots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name,
        host: serverHost || undefined,
        port: serverPort || undefined,
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
    document.getElementById('summonPass').value = '';
    loadBots();
  } catch (e) {
    alert('Request failed: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Summon Bot';
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

async function setAutoChat(name) {
  const input = document.getElementById('autoChatInput-' + escapeJs(name));
  const message = input.value.trim();
  if (!message) return;
  input.disabled = true;
  try {
    const res = await fetch(BASE + '/api/bots/' + encodeURIComponent(name) + '/autochat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: message })
    });
    if (!res.ok) {
      const err = await res.json();
      alert(err.error || 'Failed to set auto-chat');
      return;
    }
    input.value = '';
    loadBots();
  } catch (e) {
    alert('Request failed: ' + e.message);
  } finally {
    input.disabled = false;
  }
}

async function setSpam(name) {
  const input = document.getElementById('spamInput-' + escapeJs(name));
  const intervalInput = document.getElementById('spamInterval-' + escapeJs(name));
  const message = input.value.trim();
  const intervalMs = parseInt(intervalInput.value) || 30000;
  if (!message) return;
  input.disabled = true;
  intervalInput.disabled = true;
  try {
    const res = await fetch(BASE + '/api/bots/' + encodeURIComponent(name) + '/spam', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: message, intervalMs: intervalMs })
    });
    if (!res.ok) {
      const err = await res.json();
      alert(err.error || 'Failed to set spam');
      return;
    }
    input.value = '';
    loadBots();
  } catch (e) {
    alert('Request failed: ' + e.message);
  } finally {
    input.disabled = false;
    intervalInput.disabled = false;
  }
}

async function bulkSummon() {
  const count = document.getElementById('bulkCount').value.trim();
  const prefix = document.getElementById('bulkPrefix').value.trim() || 'TestBot';
  const pass = document.getElementById('bulkPass').value.trim();
  const btn = document.querySelector('button[onclick="bulkSummon()"]');
  btn.disabled = true;
  btn.textContent = 'Summoning...';
  try {
    const res = await fetch(BASE + '/api/bots/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        count: count,
        prefix: prefix,
        botPassword: pass || null,
        autoLogin: pass ? true : false
      })
    });
    if (!res.ok) {
      const err = await res.json();
      alert(err.error || 'Bulk summon failed');
      return;
    }
    const data = await res.json();
    alert('Summoned ' + data.summoned + ' bots' + (data.errors.length > 0 ? ' (' + data.errors.length + ' failed)' : ''));
    loadBots();
  } catch (e) {
    alert('Request failed: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Bulk Summon Bots';
  }
}

document.getElementById('summonBtn').addEventListener('click', summonBot);
setupModePills();
loadConfig();
loadBots();
setInterval(loadBots, 5000);