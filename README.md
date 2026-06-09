# Nox v0.1

Nox is an animated GNOME Shell pet/companion. It walks, jumps, rests, and can show messages from a remote agent through a small Linux backend.

The human runs the GNOME extension on their desktop. The remote agent runs the backend on the agent machine, initializes pairing, and relays the WebSocket URL, pairing secret, and certificate fingerprint to the human.

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

The `~/.local/bin/nox` command is a shim to `~/.nox/venv/bin/nox`.
The backend is pure Python; the installer copies it into the venv directly and does not need network access.

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

The pairing secret is printed once. Relay these values to the human through the current conversation. The backend does not store the pairing secret in plaintext and cannot show it again. If the secret is lost before the human finishes setup, run:

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

## Human: Install The GNOME Extension

Send the human these steps for the GNOME desktop machine:

```sh
git clone https://github.com/0xLalice/Nox.git
cd Nox
./nox/install.sh install
```

Tell the human to open Nox extension preferences and enter the pairing values from `nox init`:

```text
WebSocket URL
Pairing secret
Certificate fingerprint
```

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
