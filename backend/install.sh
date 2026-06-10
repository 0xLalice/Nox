#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
nox_home="${NOX_HOME:-$HOME/.nox}"
venv_dir="$nox_home/venv"
bin_dir="$HOME/.local/bin"
shim="$bin_dir/nox"

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

cat <<EOF
Nox backend installed.

Command shim:
  $shim

Runtime folder:
  $nox_home

If nox is not on PATH in this shell, run:
  export PATH="\$HOME/.local/bin:\$PATH"

Remote setup:
  Choose or ask for a hostname/IP the human desktop can reach.
  Open 8765/tcp from the human desktop to this agent machine.
  Run: nox init --public-url wss://HOST:8765/nox/ws
  Relay the WebSocket URL, pairing secret, and certificate fingerprint to the human.

Do not use ws://127.0.0.1, localhost, or SSH tunnels for normal remote setup.

Then:
  nox serve
EOF
