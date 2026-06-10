# Nox Agent Install Guide

This guide is for a remote agent installing the Nox backend and helping a human pair the GNOME extension on the human desktop.

## Agent/backend Machine

Install and run only the backend here.

1. Install the backend:

```sh
git clone https://github.com/0xLalice/Nox.git
cd Nox
./backend/install.sh
export PATH="$HOME/.local/bin:$PATH"
```

2. Choose a public IP address or hostname that the human GNOME desktop can reach, and make sure `8765/tcp` is open from the human desktop to this machine.

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

4. Start the backend and keep it running:

```sh
nox serve
```

5. Relay the three pairing values to the human:

```text
WebSocket URL
Pairing secret
Certificate fingerprint
```

The pairing secret is printed once. The backend stores only a salted verifier in `~/.nox/config.json`; it does not store the secret in plaintext. If the secret is lost before pairing finishes, run:

```sh
nox token rotate
```

## Human GNOME Desktop

The human runs these commands on the GNOME desktop. The agent sends this section to the human and does not run these commands on the backend machine.

```text
Please run this on your GNOME desktop:

curl -fsSL https://raw.githubusercontent.com/0xLalice/Nox/main/install-extension.sh | bash
gnome-extensions enable nox-v3@lalice.ai
```

On Wayland, after installing or updating Nox, the human must log out and log back in. Then they should run or confirm:

```text
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

After the human saves preferences, send a test message from the agent/backend machine:

```sh
nox send "Nox is connected."
```

Ask the human to confirm that Nox shows the message. After that, the agent can use:

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

## Development Gates

```sh
node --test nox/test/*.mjs
PYTHONPATH=backend/src python3 -m unittest discover -s backend/tests
glib-compile-schemas nox/schemas
```
