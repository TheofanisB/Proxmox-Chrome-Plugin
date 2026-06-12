# Proxmox Quick Control

Chrome popup for poking at a Proxmox box without having to log into the web UI every time.

Each node, VM and container gets a little colored square next to its name - green if it's up, red if it's not. Buttons on the right let you start/stop/reboot stuff. Refreshes itself once a minute.

I built this because I got tired of opening Proxmox in a tab just to reboot one LXC.

## Installing it

Go to `chrome://extensions`, flip on developer mode, hit "Load unpacked", point it at this folder. Pin it to the toolbar if you want, then click it and go to Settings.

## Getting it talking to Proxmox

You need an API token. In the Proxmox web UI:

Datacenter -> Permissions -> API Tokens -> Add

Pick a user (root@pam works fine if you don't care), give the token an ID like `chrome-plugin`. Proxmox will show you the secret ONCE - copy it now, you can't get it back later.

If you want to be tidy about permissions, uncheck "Privilege Separation" and give the token only `VM.PowerMgmt` + `Sys.PowerMgmt`. If you don't care, leave it alone, the token inherits the user's rights.

Now in the extension settings:

- **Host** - `https://your-proxmox:8006` or whatever. If you skip the port it assumes 8006.
- **Token ID** - looks like `root@pam!chrome-plugin`
- **Secret** - the UUID Proxmox just showed you

Hit Test Connection. If it works, save. If not, see the cert thing below.

### The cert thing

Proxmox ships with a self-signed cert by default. Chrome won't let `fetch()` hit it until you've manually accepted it in a browser tab. So: open `https://your-proxmox:8006` in a normal Chrome tab, click through the scary warning, then come back here. After that it'll work.

If you put a real cert on your Proxmox (Let's Encrypt or whatever), you can skip this.

### Wake on LAN

The browser can't send UDP packets directly, so WoL goes through Proxmox itself - it has an endpoint that tells another node to send the magic packet on your behalf. Which means:

- You need at least one other node in the cluster that IS online
- The offline node's MAC has to be set in Datacenter -> Node -> Edit -> Wake-on-LAN

If you've got a single-node setup, WoL won't work from here. Use a phone app or your router's WoL feature.

## What's in here

- `manifest.json` - the manifest
- `background.js` - service worker, runs the polling and forwards button clicks
- `proxmox.js` - API wrapper, shared between popup and worker
- `popup.*` - the popup itself
- `options.*` - the settings page
- `icons/` - generated PNGs

## Notes / gotchas

The token is stored in `chrome.storage.sync` which means it syncs across browsers you're logged into. If that bothers you, swap it for `chrome.storage.local` in `proxmox.js` and `options.js`.

Polling defaults to 1 minute. You can crank it up to 60. The badge on the extension icon shows the number of offline nodes, or `!` if the API is unreachable.

The Stop button issues a graceful shutdown (ACPI), not a hard kill. If you actually need to force-stop something you'll have to do it from the Proxmox UI - I didn't want a button for that since it's easy to hit by accident.

Everything talks directly to your Proxmox host. No data goes anywhere else.
