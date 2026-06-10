#!/usr/bin/env bash
set -euo pipefail

uuid="nox-v3@lalice.ai"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source_dir="$script_dir"
install_root="${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions"
install_dir="$install_root/$uuid"

usage() {
  cat <<EOF
usage: ./nox/install.sh install|uninstall|reinstall

Installs only the clean V3 extension:
  $source_dir

Target:
  $install_dir
EOF
}

require_source() {
  if [[ ! -f "$source_dir/metadata.json" || ! -f "$source_dir/extension.js" ]]; then
    echo "missing V3 extension source at: $source_dir" >&2
    exit 1
  fi
}

require_gnome_desktop() {
  if ! command -v gnome-extensions >/dev/null 2>&1; then
    echo "This is the Nox GNOME extension installer. Run it on the human GNOME desktop, not on the agent/backend machine." >&2
    exit 1
  fi
}

disable_extension() {
  if command -v gnome-extensions >/dev/null 2>&1; then
    gnome-extensions disable "$uuid" >/dev/null 2>&1 || true
  fi
}

enable_extension() {
  gnome-extensions enable "$uuid" || {
    print_enable_guidance >&2
    return 0
  }
}

print_enable_guidance() {
  cat <<EOF
To enable Nox, run:
  gnome-extensions enable $uuid

On Wayland, after installing or updating Nox, log out and log back in. Then run or confirm:
  gnome-extensions enable $uuid
EOF
}

install_v3() {
  require_source
  require_gnome_desktop
  if ! command -v glib-compile-schemas >/dev/null 2>&1; then
    echo "glib-compile-schemas is required for V3 preferences" >&2
    exit 1
  fi
  mkdir -p "$install_root"
  rm -rf "$install_dir"
  mkdir -p "$install_dir"
  cp -a "$source_dir/." "$install_dir/"
  if [[ -d "$install_dir/schemas" ]]; then
    glib-compile-schemas "$install_dir/schemas"
  fi
  enable_extension
  echo "Nox V3 installed to $install_dir"
  print_enable_guidance
}

uninstall_v3() {
  disable_extension
  if [[ "$install_dir" != "$install_root/$uuid" ]]; then
    echo "refusing unsafe install dir: $install_dir" >&2
    exit 1
  fi
  rm -rf "$install_dir"
  echo "Nox V3 uninstalled from $install_dir"
}

case "${1:-}" in
  install)
    install_v3
    ;;
  uninstall)
    uninstall_v3
    ;;
  reinstall)
    uninstall_v3
    install_v3
    ;;
  -h|--help|help)
    usage
    ;;
  *)
    usage >&2
    exit 2
    ;;
esac
