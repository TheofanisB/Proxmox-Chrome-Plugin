const FIELDS = ['host', 'tokenId', 'tokenSecret', 'refreshMinutes', 'confirmDestructive'];

async function load() {
  const cfg = await chrome.storage.sync.get({
    host: '', tokenId: '', tokenSecret: '',
    refreshMinutes: 1, confirmDestructive: true,
  });
  document.getElementById('host').value = cfg.host;
  document.getElementById('tokenId').value = cfg.tokenId;
  document.getElementById('tokenSecret').value = cfg.tokenSecret;
  document.getElementById('refreshMinutes').value = cfg.refreshMinutes;
  document.getElementById('confirmDestructive').checked = !!cfg.confirmDestructive;
}

function readForm() {
  return {
    host: document.getElementById('host').value.trim(),
    tokenId: document.getElementById('tokenId').value.trim(),
    tokenSecret: document.getElementById('tokenSecret').value.trim(),
    refreshMinutes: Math.max(1, Math.min(60, Number(document.getElementById('refreshMinutes').value) || 1)),
    confirmDestructive: document.getElementById('confirmDestructive').checked,
  };
}

function setStatus(msg, ok) {
  const el = document.getElementById('status');
  el.textContent = msg;
  el.className = ok ? 'ok' : 'err';
}

function buildBaseUrl(host) {
  let h = (host || '').trim().replace(/\/+$/, '');
  if (!h) return '';
  if (!/^https?:\/\//i.test(h)) h = 'https://' + h;
  if (!/:\d+$/.test(h) && !/\/api2/.test(h)) h = h + ':8006';
  return h;
}

async function testConnection() {
  const cfg = readForm();
  if (!cfg.host || !cfg.tokenId || !cfg.tokenSecret) {
    setStatus('Fill in host, token id and token secret first.', false);
    return;
  }
  setStatus('Testing…', true);
  try {
    const res = await fetch(buildBaseUrl(cfg.host) + '/api2/json/version', {
      headers: { 'Authorization': `PVEAPIToken=${cfg.tokenId}=${cfg.tokenSecret}` },
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      setStatus(`Failed (${res.status}): ${txt || res.statusText}`, false);
      return;
    }
    const j = await res.json();
    setStatus(`Connected — Proxmox VE ${j.data.version} (${j.data.release})`, true);
  } catch (e) {
    setStatus(`Network error: ${e.message}. If using a self-signed cert, visit the Proxmox URL in this browser first and accept it.`, false);
  }
}

async function save() {
  const cfg = readForm();
  await chrome.storage.sync.set(cfg);
  setStatus('Saved.', true);
  chrome.runtime.sendMessage({ type: 'refresh' });
}

document.getElementById('save').addEventListener('click', save);
document.getElementById('test').addEventListener('click', testConnection);

load();
