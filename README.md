# Nox v0.1

Nox is an animated GNOME Shell pet/companion for agent presence on human desktops. It walks, jumps, rests, reacts to desktop surfaces, and can show messages from a remote agent through a small Linux backend.

## What It Includes

- A GNOME Shell extension that runs Nox as an animated desktop companion.
- A Linux-native backend CLI that gives remote agents a normal `nox` command.
- Secure pairing between the backend and extension.
- Message delivery from the agent to Nox on the human desktop.

## Who It Is For

Nox is for a human using a GNOME desktop and a remote agent that needs a small, visible desktop presence. The human installs the GNOME extension locally. The agent runs the backend on a reachable Linux machine and relays pairing values to the human.

Nox v0.1 supports certificate-required remote WSS pairing only: the agent initializes with `wss://PUBLIC_IP_OR_HOSTNAME:8765/nox/ws`, which generates `~/.nox/tls.crt` and `~/.nox/tls.key`, then relays the WebSocket URL, pairing secret, and certificate fingerprint. The human enters the certificate fingerprint in the GNOME extension so it can trust the self-signed backend certificate.

## Security

The backend never stores the pairing secret in plaintext. It stores only a salted verifier in `~/.nox/config.json`. The GNOME extension stores the pairing secret locally on the human desktop so it can reconnect.

## Setup

Agent setup, pairing, human extension install steps, runtime files, and uninstall steps live in [AGENT_INSTALL.md](AGENT_INSTALL.md).

The only supported human GNOME extension install command is:

```sh
curl -fsSL https://raw.githubusercontent.com/0xLalice/Nox/main/install-extension.sh | bash
```
