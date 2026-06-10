# Nox Agent Install Guide

This guide is for a remote agent installing the Nox backend and helping the human pair the GNOME extension on the human desktop.

Hard rule: the agent installs only the backend on the agent machine. Do not install the GNOME extension on the agent machine. Do not run `install-extension.sh` or `gnome-extensions` on the agent machine. The agent only relays human-side extension commands to the human.

If extension files were installed on the agent machine by mistake, remove them from the agent machine:

```sh
rm -rf "${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions/nox-v3@lalice.ai"
```

## Agent: Install The Backend

From the agent machine:

```sh
git clone https://github.com/0xLalice/Nox.git
cd Nox
./backend/install.sh
export PATH="$HOME/.local/bin:$PATH"
nox --help
```

The installer creates:

```text
~/.nox/
~/.nox/venv/
~/.local/bin/nox
```

The `~/.local/bin/nox` command is a shim to `~/.nox/venv/bin/nox`. The backend is pure Python; the installer copies it into the venv directly and does not need network access.

## Agent: Send The Human Client Install Steps

Copy and paste this message to the human. These commands are for the human to run on the human GNOME desktop, not for the agent to run on the agent machine:

```text
Please run this on your GNOME desktop:

curl -fsSL https://raw.githubusercontent.com/0xLalice/Nox/main/install-extension.sh | bash
gnome-extensions enable nox-v3@lalice.ai
```

If the human wants to inspect the installer first, send this message instead:

```text
Please run this on your GNOME desktop:

curl -fsSL https://raw.githubusercontent.com/0xLalice/Nox/main/install-extension.sh -o /tmp/install-nox-extension.sh
less /tmp/install-nox-extension.sh
bash /tmp/install-nox-extension.sh
gnome-extensions enable nox-v3@lalice.ai
```

On Wayland, tell the human: after installing or updating Nox, log out and log back in. Then run or confirm the enable command:

```text
Please run this on your GNOME desktop:

gnome-extensions enable nox-v3@lalice.ai
```

For a fresh client reinstall, tell the human to run:

```text
Please run this on your GNOME desktop:

gnome-extensions disable nox-v3@lalice.ai || true
rm -rf "${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions/nox-v3@lalice.ai"
curl -fsSL https://raw.githubusercontent.com/0xLalice/Nox/main/install-extension.sh | bash
gnome-extensions enable nox-v3@lalice.ai
```

Tell the human to keep the Nox extension preferences open. The next step prints the pairing values they will enter.

## Agent: Initialize Pairing

Use a public IP address or hostname that the human desktop can reach:

```sh
nox init --public-url wss://PUBLIC_IP_OR_HOSTNAME:8765/nox/ws
```

Nox v0.1 supports one pairing path: the backend runs on the agent machine, the GNOME extension runs on the human desktop, and the human desktop reaches the agent machine at `wss://PUBLIC_IP_OR_HOSTNAME:8765/nox/ws`. Choose or ask for a reachable `PUBLIC_IP_OR_HOSTNAME`, open `8765/tcp` from the human desktop to the agent machine, and use that WSS URL when initializing.

Running `nox init` with `wss://PUBLIC_IP_OR_HOSTNAME:8765/nox/ws` generates the backend TLS certificate files:

```text
~/.nox/tls.crt
~/.nox/tls.key
```

It also prints the certificate fingerprint for that self-signed backend certificate.

The agent must relay exactly these three values to the human:

```text
WebSocket URL
Pairing secret
Certificate fingerprint
```

Tell the human to paste the certificate fingerprint into the Nox extension Certificate Fingerprint field. The extension uses that fingerprint to trust the self-signed backend certificate.

If `nox init` does not print a certificate fingerprint, stop. The backend was not initialized correctly for remote WSS.

The pairing secret is printed once. Relay these values through the current conversation. The backend does not store the pairing secret in plaintext and cannot show it again. If the secret is lost before the human finishes setup, run:

```sh
nox token rotate
```

If the human desktop cannot reach that public WSS URL, stop and fix the network path before pairing.

## Agent: Start The Backend

```sh
nox serve
```

Keep this process running.

## Confirm Nox

After the human saves preferences, confirm the connection:

```sh
nox send "Nox is connected."
```

Ask the human to confirm that Nox shows the message. After that, the agent can use:

```sh
nox send "message"
nox status
```

## Runtime Files

Nox backend state lives in one local folder on the agent machine:

```text
~/.nox/venv/
~/.nox/config.json
~/.nox/queue.jsonl
~/.nox/tls.crt
~/.nox/tls.key
~/.nox/nox.log
```

The backend never stores the pairing secret in plaintext. `config.json` stores only a salted token verifier, and backend logs must not contain the pairing secret. The GNOME extension stores the pairing secret locally so it can reconnect.

## Uninstall

On the agent machine:

```sh
rm -f "$HOME/.local/bin/nox"
rm -rf "$HOME/.nox"
```

On the GNOME desktop machine:

```sh
./nox/install.sh uninstall
```

## Development Gates

```sh
node --test nox/test/*.mjs
PYTHONPATH=backend/src python3 -m unittest discover -s backend/tests
glib-compile-schemas nox/schemas
```
