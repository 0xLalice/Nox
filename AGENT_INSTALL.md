# Nox Agent Install Guide

This guide is for a remote agent installing the Nox backend and helping the human pair the GNOME extension on the human desktop.

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

Send the human these steps for the GNOME desktop machine:

```sh
curl -fsSL https://raw.githubusercontent.com/0xLalice/Nox/main/install-extension.sh | bash
gnome-extensions enable nox-v3@lalice.ai
```

If the human wants to inspect the installer first:

```sh
curl -fsSL https://raw.githubusercontent.com/0xLalice/Nox/main/install-extension.sh -o /tmp/install-nox-extension.sh
less /tmp/install-nox-extension.sh
bash /tmp/install-nox-extension.sh
gnome-extensions enable nox-v3@lalice.ai
```

On Wayland, tell the human to log out and log back in if Nox does not appear or preferences do not load, then run the enable command again:

```sh
gnome-extensions enable nox-v3@lalice.ai
```

For a fresh client reinstall, tell the human to run:

```sh
gnome-extensions disable nox-v3@lalice.ai || true
rm -rf "${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions/nox-v3@lalice.ai"
curl -fsSL https://raw.githubusercontent.com/0xLalice/Nox/main/install-extension.sh | bash
gnome-extensions enable nox-v3@lalice.ai
```

Tell the human to keep the Nox extension preferences open. The next step prints the pairing values they will enter.

## Agent: Initialize Pairing

Use a hostname or IP address that the human desktop can reach:

```sh
nox init --public-url wss://AGENT_HOST:8765/nox/ws
```

`nox init` prints pairing values for the human:

```text
WebSocket URL
Pairing secret
Certificate fingerprint
```

Relay those values to the human and tell them to enter them in Nox extension preferences.

The pairing secret is printed once. Relay these values through the current conversation. The backend does not store the pairing secret in plaintext and cannot show it again. If the secret is lost before the human finishes setup, run:

```sh
nox token rotate
```

Remote pairing should use `wss://`. Same-machine development may use:

```sh
nox init --public-url ws://127.0.0.1:8765/nox/ws
```

The human desktop must be able to connect to `AGENT_HOST:8765/tcp`.

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
