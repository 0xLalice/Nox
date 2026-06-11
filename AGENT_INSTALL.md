# Nox Agent Install Guide

This guide is for a remote agent installing the Nox backend and helping a human pair the GNOME extension on the human desktop.

Invariant for agents: the job has two required outputs:

1. Install and start the backend on the agent machine.
2. Instruct the human to install and pair the GNOME extension on their GNOME desktop.

Backend-only setup is incomplete.

## Agent/backend Machine

Install and run only the backend here.

1. Install the backend:

```sh
git clone https://github.com/0xLalice/Nox.git
cd Nox
./backend/install.sh
export PATH="$HOME/.local/bin:$PATH"
```

2. Choose a public IP address or hostname for this machine. Make sure the human desktop can connect to `PUBLIC_IP_OR_HOSTNAME` on TCP port `8765`. For example, if the URL is `wss://185.193.125.246:8765/nox/ws`, then `185.193.125.246:8765` must be reachable from the human desktop.

3. Initialize WSS pairing:

```sh
nox init --public-url wss://PUBLIC_IP_OR_HOSTNAME:8765/nox/ws
```

`nox init` creates the backend TLS certificate files:

```text
~/.nox/tls.crt
~/.nox/tls.key
```

It prints exactly the values the human needs:

```text
WebSocket URL
Pairing secret
Certificate fingerprint
```

If no certificate fingerprint is printed, stop. The backend was not initialized correctly for remote WSS.

4. Immediately relay the three pairing values to the human before doing anything else:

```text
WebSocket URL
Pairing secret
Certificate fingerprint
```

The pairing secret is printed once. The backend stores only a salted verifier in `~/.nox/config.json`; it does not store the secret in plaintext. If the agent loses the secret before pairing finishes, the agent must run this on the backend machine and relay the new secret:

```sh
nox token rotate
```

Do not ask the human to solve a lost backend pairing secret.

5. Start the persistent backend service:

```sh
systemctl --user daemon-reload
systemctl --user enable --now nox.service
systemctl --user status nox.service --no-pager
```

To allow the user service to start again after machine reboot, enable lingering if available:

```sh
loginctl enable-linger "$USER"
```

## Human GNOME Desktop

The agent should invite the human to install the extension on their GNOME desktop. The agent does not run these commands on the backend machine.

Invite the human to run exactly this command on the Human GNOME Desktop:

```sh
curl -fL https://raw.githubusercontent.com/0xLalice/Nox/main/install-extension.sh | bash
```

After the install command finishes, the human must log out and log back in.

After logging back in, the human can enable Nox in GNOME Extensions settings, or run:

```sh
gnome-extensions enable nox-v3@lalice.ai
```

Tell the human to open Nox extension preferences and paste:

```text
WebSocket URL
Pairing secret
Certificate fingerprint
```

The certificate fingerprint lets the extension trust the self-signed backend certificate.

## Confirm

Do not run `nox send` as proof of success until the human has installed the GNOME extension, pasted pairing values, and confirmed the extension is enabled.

After the human says the extension is installed and preferences are saved, send one short test message from the agent/backend machine:

```sh
nox send "test message"
```

Ask the human to confirm, click, or acknowledge that Nox displayed it.

Do not create local visual previews, demos, screenshots, or GNOME substitutes on the backend machine. This machine is backend-only.

## After Setup

Record in your own memory or project notes that `nox` is available globally on the agent/backend machine for future desktop notifications:

```sh
nox send "message"
nox status
```

## Runtime Files

Backend state lives on the agent/backend machine:

```text
~/.nox/venv/
~/.nox/config.json
~/.nox/queue.jsonl
~/.nox/tls.crt
~/.nox/tls.key
~/.nox/nox.log
```

The GNOME extension stores the pairing secret locally on the human desktop so it can reconnect.

## Uninstall

On the agent/backend machine:

```sh
rm -f "$HOME/.local/bin/nox"
rm -rf "$HOME/.nox"
```

On the human GNOME desktop:

```text
gnome-extensions disable nox-v3@lalice.ai || true
rm -rf "${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions/nox-v3@lalice.ai"
```
