# Nox V3

Clean V3 GNOME extension foundation.

Current behavior:

- Nox walks on ground level using only `0.webp..15.webp` walking frames.
- Left walking is rendered by mirroring the same walking frames; no duplicate left assets are included.
- When projected body movement reaches a screen wall, Nox clamps to the wall and walks the other way.
- Behavior uses the V3 hybrid pipeline: context builder, weighted behavior tree, selector, action registry, active action.

Preferences:

- Size
- Movement Profile: Calm, Balanced, Snappy, Smooth
- Walking Speed

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
node --test test/*.test.mjs
```
