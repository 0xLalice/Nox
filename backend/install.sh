#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
nox_home="${NOX_HOME:-$HOME/.nox}"
venv_dir="$nox_home/venv"
bin_dir="$HOME/.local/bin"
shim="$bin_dir/nox"
systemd_user_dir="$HOME/.config/systemd/user"
service_file="$systemd_user_dir/nox.service"

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required" >&2
  exit 1
fi

mkdir -p "$nox_home"
chmod 700 "$nox_home"
python3 -m venv "$venv_dir"
purelib="$("$venv_dir/bin/python" - <<'PY'
import sysconfig
print(sysconfig.get_paths()["purelib"])
PY
)"
rm -rf "$purelib/nox_server"
mkdir -p "$purelib/nox_server"
cp -a "$script_dir/src/nox_server/." "$purelib/nox_server/"
cat > "$venv_dir/bin/nox" <<EOF
#!$venv_dir/bin/python
from nox_server.cli import main
raise SystemExit(main())
EOF
chmod 755 "$venv_dir/bin/nox"
mkdir -p "$bin_dir"
ln -sfn "$venv_dir/bin/nox" "$shim"
mkdir -p "$systemd_user_dir"
cat > "$service_file" <<EOF
[Unit]
Description=Nox backend WebSocket server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
Environment=NOX_HOME=$nox_home
ExecStart=$venv_dir/bin/nox serve
Restart=on-failure
RestartSec=3

[Install]
WantedBy=default.target
EOF

cat <<EOF
Nox backend installed.
This installer installed only the backend on this agent machine.

Command shim:
  $shim

Runtime folder:
  $nox_home

Systemd user service:
  $service_file

If nox is not on PATH in this shell, run:
  export PATH="\$HOME/.local/bin:\$PATH"

Remote setup:
  Do not install the GNOME extension on this agent machine.
  Do not run install-extension.sh or gnome-extensions on this agent machine.
  Do not create local visual previews, demos, screenshots, or GNOME substitutes on this backend-only machine.
  Do not queue or send test messages until the human has installed the extension and saved preferences.
  MANDATORY: installation is NOT complete after backend setup.
  After starting backend, your next response to the human MUST instruct them to install the GNOME extension on their own GNOME desktop.
  Do not claim Nox is installed until the human extension is installed, paired, and confirmed.
  Relay the Human GNOME Desktop instructions from AGENT_INSTALL.md; do not execute them here.
  Agent machine flow: backend/install.sh -> nox init -> systemctl --user enable --now nox.service
  Human GNOME desktop flow: curl -fsSL https://raw.githubusercontent.com/0xLalice/Nox/main/install-extension.sh | bash -> enable extension -> paste URL/secret/fingerprint
  Choose or ask for a public IP or hostname the human desktop can reach.
  Open 8765/tcp from the human desktop to this agent machine.
  Run: nox init --public-url wss://PUBLIC_IP_OR_HOSTNAME:8765/nox/ws
  Immediately relay the WebSocket URL, pairing secret, and certificate fingerprint to the human before doing anything else.
  Invite the human to run exactly this command on the Human GNOME Desktop:
    curl -fsSL https://raw.githubusercontent.com/0xLalice/Nox/main/install-extension.sh | bash
  If the pairing secret is lost before pairing, the agent must run: nox token rotate
  Then relay the new secret to the human.
  Then run: systemctl --user daemon-reload
  Then run: systemctl --user enable --now nox.service
  Verify: systemctl --user status nox.service --no-pager

Nox v0.1 uses this remote WSS URL and certificate fingerprint for pairing.

For restart after reboot, enable user lingering when available:
  loginctl enable-linger "\$USER"
EOF
