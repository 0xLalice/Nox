# Nox V3

Nox v0.1 is the GNOME Shell client extension for the desktop Nox actor.

Current extension scope:

- Walks and runs on the primary monitor with mirrored left-facing movement.
- Detects visible window top borders as platform surfaces.
- Shows the same reach circle used by the jump scan when Jump Reach changes.
- Supports upward V1, generated, and jetpack manual jumps to fixed scan-time targets.
- Keeps autonomous jumps on the V1 path while manual jump variants remain available.
- Supports rest behavior and a small fatigue gauge.
- Shows queued WebSocket messages in a Nox bubble with previous, next, OK, and ack-all behavior.

Connection behavior:

- The extension is a client only; it does not install or start a backend service.
- Local WebSocket URLs may use `ws://127.0.0.1` or `ws://localhost`.
- Remote connections must use `wss://` with a pinned SHA256 certificate fingerprint.
- A token is sent in the WebSocket hello frame and is stored in GNOME settings.
- Background connection can be paused from preferences.
- The Test Connection button checks the configured endpoint from the preferences window.

Preferences:

- WebSocket URL
- Token
- Certificate Fingerprint
- Pause Background Connection
- Test Connection
- Gravity Profile: Earth-like, Moon-like
- Jump Reach
- Try rest now
- Try V1 jump now
- Try generated jump now
- Try jetpack jump now

Install from a GitHub clone:

```sh
git clone <repo-url>
cd <repo>
./nox-v3.sh install
```

Reinstall after changes:

```sh
./nox-v3.sh reinstall
```

Uninstall:

```sh
./nox-v3.sh uninstall
```

The script installs only `extension/` to:

```text
~/.local/share/gnome-shell/extensions/nox-v3@lalice.ai
```

The install script compiles the V3 schema in `extension/schemas/`.

If `gnome-extensions` is available, the script enables/disables the V3 extension automatically. If not, use the GNOME Extensions app or run:

```sh
gnome-extensions enable nox-v3@lalice.ai
```

GNOME Shell reload caveat: on X11, `Alt+F2`, `r`, Enter can reload Shell. On Wayland, logging out and back in is usually required.

Run tests:

```sh
node --test
```
