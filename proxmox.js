// Shared Proxmox API helpers. Used by both popup and background service worker.

async function getConfig() {
  const defaults = {
    host: '',
    tokenId: '',
    tokenSecret: '',
    refreshMinutes: 1,
    verifyTls: true,
    confirmDestructive: true,
  };
  const stored = await chrome.storage.sync.get(defaults);
  return { ...defaults, ...stored };
}

function buildBaseUrl(host) {
  let h = (host || '').trim().replace(/\/+$/, '');
  if (!h) return '';
  if (!/^https?:\/\//i.test(h)) h = 'https://' + h;
  if (!/:\d+$/.test(h) && !/\/api2/.test(h)) h = h + ':8006';
  return h;
}

function authHeader(cfg) {
  return `PVEAPIToken=${cfg.tokenId}=${cfg.tokenSecret}`;
}

async function pveFetch(path, { method = 'GET', body } = {}) {
  const cfg = await getConfig();
  if (!cfg.host || !cfg.tokenId || !cfg.tokenSecret) {
    throw new Error('Proxmox is not configured. Open Settings.');
  }
  const url = buildBaseUrl(cfg.host) + path;
  const headers = { 'Authorization': authHeader(cfg) };
  let payload;
  if (body) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    payload = new URLSearchParams(body).toString();
  }
  const res = await fetch(url, { method, headers, body: payload });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Proxmox ${res.status}: ${txt || res.statusText}`);
  }
  const json = await res.json();
  return json.data;
}

async function fetchClusterState() {
  const nodes = await pveFetch('/api2/json/nodes');
  const result = [];
  for (const n of nodes) {
    const node = {
      name: n.node,
      status: n.status, // 'online' | 'offline' | 'unknown'
      uptime: n.uptime || 0,
      cpu: n.cpu || 0,
      mem: n.mem || 0,
      maxmem: n.maxmem || 0,
      vms: [],
      cts: [],
    };
    if (n.status === 'online') {
      try {
        const [vms, cts] = await Promise.all([
          pveFetch(`/api2/json/nodes/${n.node}/qemu`).catch(() => []),
          pveFetch(`/api2/json/nodes/${n.node}/lxc`).catch(() => []),
        ]);
        node.vms = (vms || []).map(v => ({
          vmid: v.vmid,
          name: v.name || `vm-${v.vmid}`,
          status: v.status,
          uptime: v.uptime || 0,
        })).sort((a, b) => a.vmid - b.vmid);
        node.cts = (cts || []).map(c => ({
          vmid: c.vmid,
          name: c.name || `ct-${c.vmid}`,
          status: c.status,
          uptime: c.uptime || 0,
        })).sort((a, b) => a.vmid - b.vmid);
      } catch (e) {
        node.error = e.message;
      }
    }
    result.push(node);
  }
  return { nodes: result, fetchedAt: Date.now() };
}

async function vmAction(node, vmid, action) {
  return pveFetch(`/api2/json/nodes/${node}/qemu/${vmid}/status/${action}`, { method: 'POST' });
}
async function ctAction(node, vmid, action) {
  return pveFetch(`/api2/json/nodes/${node}/lxc/${vmid}/status/${action}`, { method: 'POST' });
}
async function nodeAction(node, command) {
  // command: 'reboot' | 'shutdown'
  return pveFetch(`/api2/json/nodes/${node}/status`, { method: 'POST', body: { command } });
}
async function nodeWakeOnLan(node) {
  return pveFetch(`/api2/json/nodes/${node}/wakeonlan`, { method: 'POST' });
}

self.Proxmox = {
  getConfig,
  fetchClusterState,
  vmAction,
  ctAction,
  nodeAction,
  nodeWakeOnLan,
};
