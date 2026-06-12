const CACHE_KEY = 'cachedState';

const $ = sel => document.querySelector(sel);
const nodesEl = $('#nodes');
const errorEl = $('#error');
const emptyEl = $('#empty');
const fetchedEl = $('#fetched');

function ago(ts) {
  if (!ts) return '';
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

function statusClass(status) {
  if (status === 'online' || status === 'running') return 'status-up';
  if (status === 'offline' || status === 'stopped') return 'status-down';
  return 'status-unknown';
}

async function getConfig() {
  return chrome.storage.sync.get({
    host: '', tokenId: '', tokenSecret: '', confirmDestructive: true,
  });
}

function sendAction(payload) {
  return new Promise(resolve => {
    chrome.runtime.sendMessage(payload, resolve);
  });
}

async function doAction(kind, node, vmid, action, label) {
  const cfg = await getConfig();
  const destructive = ['stop', 'shutdown', 'reboot'].includes(action);
  if (destructive && cfg.confirmDestructive) {
    const target = vmid ? `${vmid}` : node;
    if (!confirm(`${label} ${target}?`)) return;
  }
  document.querySelectorAll('button.btn').forEach(b => b.disabled = true);
  const res = await sendAction({ type: 'action', kind, node, vmid, action });
  document.querySelectorAll('button.btn').forEach(b => b.disabled = false);
  if (!res || !res.ok) {
    errorEl.textContent = (res && res.error) || 'Action failed';
    errorEl.classList.remove('hidden');
  } else {
    errorEl.classList.add('hidden');
    await refreshFromCache();
  }
}

function actionBtn(label, cls, onClick, title) {
  const b = document.createElement('button');
  b.className = `btn ${cls}`;
  b.textContent = label;
  if (title) b.title = title;
  b.addEventListener('click', onClick);
  return b;
}

function renderNode(node) {
  const card = document.createElement('div');
  card.className = 'node-card';

  // Node header
  const head = document.createElement('div');
  head.className = 'node-header';

  const box = document.createElement('div');
  box.className = `status-box ${statusClass(node.status)}`;
  box.title = node.status;
  head.appendChild(box);

  const nameWrap = document.createElement('div');
  nameWrap.style.flex = '1';
  nameWrap.style.overflow = 'hidden';
  const name = document.createElement('div');
  name.className = 'entity-name';
  name.textContent = node.name;
  nameWrap.appendChild(name);
  if (node.status === 'online') {
    const meta = document.createElement('div');
    meta.className = 'muted';
    const memPct = node.maxmem ? Math.round((node.mem / node.maxmem) * 100) : 0;
    meta.textContent = `CPU ${Math.round(node.cpu * 100)}% · MEM ${memPct}%`;
    meta.style.fontSize = '10px';
    nameWrap.appendChild(meta);
  }
  head.appendChild(nameWrap);

  const actions = document.createElement('div');
  actions.className = 'actions';
  if (node.status === 'online') {
    actions.appendChild(actionBtn('Reboot', 'reboot',
      () => doAction('node', node.name, null, 'reboot', 'Reboot node'), 'Reboot node'));
    actions.appendChild(actionBtn('Stop', 'stop',
      () => doAction('node', node.name, null, 'shutdown', 'Shutdown node'), 'Shutdown node'));
  } else {
    actions.appendChild(actionBtn('WoL', 'wol',
      () => doAction('wol', node.name, null, null, 'Wake'), 'Wake on LAN'));
  }
  head.appendChild(actions);
  card.appendChild(head);

  if (node.error) {
    const err = document.createElement('div');
    err.className = 'empty-list';
    err.style.color = '#fca5a5';
    err.textContent = node.error;
    card.appendChild(err);
  }

  // Guests
  const renderGuest = (g, kind) => {
    const row = document.createElement('div');
    row.className = 'guest-row';

    const sBox = document.createElement('div');
    sBox.className = `status-box ${statusClass(g.status)}`;
    sBox.title = g.status;
    row.appendChild(sBox);

    const type = document.createElement('span');
    type.className = `guest-type ${kind}`;
    type.textContent = kind === 'vm' ? 'VM' : 'CT';
    row.appendChild(type);

    const nm = document.createElement('div');
    nm.className = 'entity-name';
    nm.textContent = g.name;
    const meta = document.createElement('span');
    meta.className = 'entity-meta';
    meta.textContent = `#${g.vmid}`;
    nm.appendChild(meta);
    row.appendChild(nm);

    const a = document.createElement('div');
    a.className = 'actions';
    const isRunning = g.status === 'running';
    if (isRunning) {
      a.appendChild(actionBtn('Reboot', 'reboot',
        () => doAction(kind, node.name, g.vmid, 'reboot', 'Reboot'), 'Reboot'));
      a.appendChild(actionBtn('Stop', 'stop',
        () => doAction(kind, node.name, g.vmid, 'shutdown', 'Shutdown'), 'Graceful shutdown'));
    } else {
      a.appendChild(actionBtn('Start', 'start',
        () => doAction(kind, node.name, g.vmid, 'start', 'Start'), 'Start'));
    }
    row.appendChild(a);
    return row;
  };

  if (node.status === 'online') {
    const list = document.createElement('div');
    list.className = 'guest-list';

    if (node.vms.length) {
      const lbl = document.createElement('div');
      lbl.className = 'group-label';
      lbl.textContent = `Virtual Machines (${node.vms.length})`;
      list.appendChild(lbl);
      node.vms.forEach(v => list.appendChild(renderGuest(v, 'vm')));
    }
    if (node.cts.length) {
      const lbl = document.createElement('div');
      lbl.className = 'group-label';
      lbl.textContent = `Containers (${node.cts.length})`;
      list.appendChild(lbl);
      node.cts.forEach(c => list.appendChild(renderGuest(c, 'ct')));
    }
    if (!node.vms.length && !node.cts.length && !node.error) {
      const e = document.createElement('div');
      e.className = 'empty-list';
      e.textContent = 'No VMs or containers.';
      list.appendChild(e);
    }
    card.appendChild(list);
  }

  return card;
}

async function refreshFromCache() {
  const { [CACHE_KEY]: state } = await chrome.storage.local.get(CACHE_KEY);
  const cfg = await getConfig();

  if (!cfg.host || !cfg.tokenId || !cfg.tokenSecret) {
    emptyEl.classList.remove('hidden');
    nodesEl.innerHTML = '';
    errorEl.classList.add('hidden');
    fetchedEl.textContent = '';
    return;
  }
  emptyEl.classList.add('hidden');

  if (!state) {
    fetchedEl.textContent = 'loading…';
    return;
  }
  if (state.error) {
    errorEl.textContent = state.error;
    errorEl.classList.remove('hidden');
  } else {
    errorEl.classList.add('hidden');
  }
  fetchedEl.textContent = state.fetchedAt ? ago(state.fetchedAt) : '';

  nodesEl.innerHTML = '';
  if (state.nodes) {
    state.nodes
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach(n => nodesEl.appendChild(renderNode(n)));
  }
}

$('#refresh').addEventListener('click', async () => {
  fetchedEl.textContent = 'refreshing…';
  await sendAction({ type: 'refresh' });
  await refreshFromCache();
});

$('#openSettings').addEventListener('click', () => chrome.runtime.openOptionsPage());
$('#goSettings').addEventListener('click', () => chrome.runtime.openOptionsPage());

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[CACHE_KEY]) refreshFromCache();
});

refreshFromCache();
// trigger a refresh whenever popup opens
sendAction({ type: 'refresh' });
