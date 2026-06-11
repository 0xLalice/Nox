#!/usr/bin/env bash
set -euo pipefail

uuid="nox-v3@lalice.ai"
repo="${NOX_REPO:-0xLalice/Nox}"
ref="${NOX_REF:-main}"
archive_url="https://codeload.github.com/$repo/tar.gz/$ref"
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

dir_bytes() {
  python3 - "$1" <<'PY'
import os
import sys

total = 0
for root, _dirs, files in os.walk(sys.argv[1]):
    for name in files:
        total += os.path.getsize(os.path.join(root, name))
print(total)
PY
}

file_count() {
  python3 - "$1" <<'PY'
import os
import sys

total = 0
for _root, _dirs, files in os.walk(sys.argv[1]):
    total += len(files)
print(total)
PY
}

file_bytes() {
  python3 - "$1" <<'PY'
import os
import sys

print(os.path.getsize(sys.argv[1]))
PY
}

human_mb() {
  python3 - "$1" <<'PY'
import sys

print(f"{int(sys.argv[1]) / 1_000_000:.2f} MB")
PY
}

print_install_summary() {
  cat <<EOF
Nox V3 extension install summary:
  Total downloaded: $downloaded_bytes bytes ($(human_mb "$downloaded_bytes"))
  Installed extension size: $installed_bytes bytes ($(human_mb "$installed_bytes"))
  Jump-jetpack asset size: $jump_jetpack_bytes bytes ($(human_mb "$jump_jetpack_bytes"))
  Installed file count: $installed_files
  Install path: $install_dir
EOF
}

require_gnome_desktop
require_command curl
require_command python3
require_command tar
require_command glib-compile-schemas

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

archive="$tmp/nox-source.tar.gz"
extract_dir="$tmp/source"
mkdir -p "$extract_dir"

echo "Downloading Nox GNOME extension archive..."
curl -fL --progress-bar "$archive_url" -o "$archive"
downloaded_bytes="$(file_bytes "$archive")"

echo "Extracting extension payload..."
tar -xzf "$archive" -C "$extract_dir"

archive_root="$(find "$extract_dir" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
if [[ -z "${archive_root:-}" ]]; then
  echo "downloaded archive did not contain a source directory" >&2
  exit 1
fi

source_dir="$archive_root/nox"
if [[ -z "${source_dir:-}" || ! -f "$source_dir/metadata.json" || ! -f "$source_dir/extension.js" ]]; then
  echo "downloaded files do not contain the Nox extension directory" >&2
  exit 1
fi

rm -rf "$source_dir/test"

echo "Installing Nox GNOME extension..."
mkdir -p "$install_root"
rm -rf "$install_dir"
mkdir -p "$install_dir"
cp -a "$source_dir/." "$install_dir/"
glib-compile-schemas "$install_dir/schemas"

gnome-extensions enable "$uuid" || true

installed_bytes="$(dir_bytes "$install_dir")"
installed_files="$(file_count "$install_dir")"
jump_jetpack_bytes=0
if [[ -d "$install_dir/assets/nox/jump-jetpack" ]]; then
  jump_jetpack_bytes="$(dir_bytes "$install_dir/assets/nox/jump-jetpack")"
fi

print_install_summary
print_enable_guidance
