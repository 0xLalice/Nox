#!/usr/bin/env bash
set -euo pipefail

uuid="nox-v3@lalice.ai"
repo="${NOX_REPO:-0xLalice/Nox}"
ref="${NOX_REF:-main}"
tree_url="https://api.github.com/repos/$repo/git/trees/$ref?recursive=1"
raw_base_url="https://raw.githubusercontent.com/$repo/$ref"
install_root="${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions"
install_dir="$install_root/$uuid"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "$1 is required" >&2
    exit 1
  fi
}

require_gnome_desktop() {
  if ! command -v gnome-extensions >/dev/null 2>&1; then
    echo "This is the Nox GNOME extension installer. Run it on the human GNOME desktop, not on the agent/backend machine." >&2
    exit 1
  fi
}

print_enable_guidance() {
  cat <<EOF
To enable Nox, run:
  gnome-extensions enable $uuid

On Wayland, after installing or updating Nox, log out and log back in. Then run or confirm:
  gnome-extensions enable $uuid
EOF
}

require_gnome_desktop
require_command curl
require_command python3
require_command glib-compile-schemas

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

curl -fsSL "$tree_url" -o "$tmp/tree.json"

python3 - "$tmp/tree.json" > "$tmp/extension-files.txt" <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as fp:
    data = json.load(fp)

for item in data.get("tree", []):
    path = item.get("path", "")
    if item.get("type") != "blob":
        continue
    if not path.startswith("nox/"):
        continue
    if path.startswith("nox/test/"):
        continue
    if path == "nox/install.sh":
        continue
    print(path)
PY

if [[ ! -s "$tmp/extension-files.txt" ]]; then
  echo "GitHub tree did not list any Nox extension files" >&2
  exit 1
fi

while IFS= read -r path; do
  dest="$tmp/$path"
  mkdir -p "$(dirname "$dest")"
  curl -fsSL "$raw_base_url/$path" -o "$dest"
done < "$tmp/extension-files.txt"

source_dir="$tmp/nox"
if [[ -z "${source_dir:-}" || ! -f "$source_dir/metadata.json" || ! -f "$source_dir/extension.js" ]]; then
  echo "downloaded files do not contain the Nox extension directory" >&2
  exit 1
fi

mkdir -p "$install_root"
rm -rf "$install_dir"
mkdir -p "$install_dir"
cp -a "$source_dir/." "$install_dir/"
glib-compile-schemas "$install_dir/schemas"

gnome-extensions enable "$uuid" || true

echo "Nox V3 extension installed to $install_dir"
print_enable_guidance
