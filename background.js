importScripts('proxmox.js');

const ALARM_NAME = 'proxmox-refresh';
const CACHE_KEY = 'cachedState';

async function refresh() {
  try {
    const state = await Proxmox.fetchClusterState();
    await chrome.storage.local.set({ [CACHE_KEY]: state });
    chrome.action.setBadgeBackgroundColor({ color: '#16a34a' });
    const offline = state.nodes.filter(n => n.status !== 'online').length;
    chrome.action.setBadgeText({ text: offline > 0 ? String(offline) : '' });
    if (offline > 0) chrome.action.setBadgeBackgroundColor({ color: '#dc2626' });
  } catch (e) {
    await chrome.storage.local.set({ [CACHE_KEY]: { error: e.message, fetchedAt: Date.now() } });
    chrome.action.setBadgeText({ text: '!' });
    chrome.action.setBadgeBackgroundColor({ color: '#dc2626' });
  }
}

async function setupAlarm() {
  const cfg = await Proxmox.getConfig();
  const minutes = Math.max(1, Number(cfg.refreshMinutes) || 1);
  await chrome.alarms.clear(ALARM_NAME);
  await chrome.alarms.create(ALARM_NAME, { periodInMinutes: minutes, delayInMinutes: 0.05 });
}

chrome.runtime.onInstalled.addListener(() => { setupAlarm(); refresh(); });
chrome.runtime.onStartup.addListener(() => { setupAlarm(); refresh(); });

chrome.alarms.onAlarm.addListener(a => { if (a.name === ALARM_NAME) refresh(); });

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && (changes.refreshMinutes || changes.host || changes.tokenId || changes.tokenSecret)) {
    setupAlarm();
    refresh();
  }
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      if (msg.type === 'refresh') { await refresh(); sendResponse({ ok: true }); return; }
      if (msg.type === 'action') {
        const { kind, node, vmid, action } = msg;
        if (kind === 'vm') await Proxmox.vmAction(node, vmid, action);
        else if (kind === 'ct') await Proxmox.ctAction(node, vmid, action);
        else if (kind === 'node') await Proxmox.nodeAction(node, action);
        else if (kind === 'wol') await Proxmox.nodeWakeOnLan(node);
        else throw new Error('Unknown action kind: ' + kind);
        setTimeout(refresh, 1500);
        sendResponse({ ok: true });
        return;
      }
    } catch (e) {
      sendResponse({ ok: false, error: e.message });
    }
  })();
  return true; // async
});
