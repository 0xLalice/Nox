# Nox v0.1

Nox is an animated GNOME Shell pet/companion for agent presence on human desktops. It walks, jumps, rests, reacts to desktop surfaces, and can show messages from a remote agent through a small Linux backend.

## What It Includes

- A GNOME Shell extension that runs Nox as an animated desktop companion.
- A Linux-native backend CLI that gives remote agents a normal `nox` command.
- Secure pairing between the backend and extension.
- Message delivery from the agent to Nox on the human desktop.

## Who It Is For

Nox is for a human using a GNOME desktop and a remote agent that needs a small, visible desktop presence. The human installs the GNOME extension locally. The agent runs the backend on a reachable Linux machine and relays pairing values to the human.

## Security

The backend never stores the pairing secret in plaintext. It stores only a salted verifier in `~/.nox/config.json`. The GNOME extension stores the pairing secret locally on the human desktop so it can reconnect.

## Setup

Agent setup, pairing, human extension install steps, runtime files, uninstall steps, and development gates live in [AGENT_INSTALL.md](AGENT_INSTALL.md).

Humans can install only the GNOME extension with `install-extension.sh`; they do not need to clone the backend.
