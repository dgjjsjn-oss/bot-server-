const BASE = '';
let selectedMode = 'idle';
let serverHost = '';
let serverPort = '';

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
    document.getElementById('serverHost').textContent = serverHost || 'not set';
    document.getElementById('serverPort').textContent = serverPort || 'not set';
  } catch (e) {
    console.error('Failed to load config:', e);
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
      '<div class="chat-row">' +
      '<input type="text" id="chatInput-' + escapeJs(b.name) + '" placeholder="Type command or chat...">' +
      '<button onclick="sendChat(\'' + escapeJs(b.name) + '\')">Send</button>' +
      '</div>' +
      '<div class="feature-row">' +
      '<input type="text" id="autoChatInput-' + escapeJs(b.name) + '" placeholder="Auto-chat on join...">' +
      '<button onclick="setAutoChat(\'' + escapeJs(b.name) + '\')">Set Auto-Chat</button>' +
      '</div>' +
      '<div class="feature-row">' +
      '<input type="text" id="spamInput-' + escapeJs(b.name) + '" placeholder="Spam message...">' +
      '<input type="number" id="spamIntervalInput-' + escapeJs(b.name) + '" placeholder="ms" value="30000" style="width:80px;">' +
      '<button onclick="setSpam(\'' + escapeJs(b.name) + '\')">Set Spam</button>' +
      '</div>' +
      '<div class="console-box" id="console-' + escapeJs(b.name) + '">' + logsHtml + '</div>';
    list.appendChild(item);

    const consoleBox = document.getElementById('console-' + escapeJs(b.name));
    if (consoleBox) consoleBox.scrollTop = consoleBox.scrollHeight;
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
  const intervalInput = document.getElementById('spamIntervalInput-' + escapeJs(name));
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

function escapeHtml(text) {
  if (!text) return '';
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeJs(text) {
  return String(text).replace(/'/g, "\\'").replace(/\\/g, '\\\\');
}

document.getElementById('summonBtn').addEventListener('click', summonBot);
setupModePills();
loadConfig();
loadBots();
setInterval(loadBots, 5000);
