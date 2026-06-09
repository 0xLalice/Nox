from __future__ import annotations

import os
from pathlib import Path


def nox_home() -> Path:
    return Path(os.environ.get("NOX_HOME", Path.home() / ".nox")).expanduser()


def ensure_home() -> Path:
    home = nox_home()
    home.mkdir(parents=True, exist_ok=True)
    home.chmod(0o700)
    return home


def config_path() -> Path:
    return nox_home() / "config.json"


def queue_path() -> Path:
    return nox_home() / "queue.jsonl"


def tls_cert_path() -> Path:
    return nox_home() / "tls.crt"


def tls_key_path() -> Path:
    return nox_home() / "tls.key"


def log_path() -> Path:
    return nox_home() / "nox.log"


def secure_write(path: Path, text: str) -> None:
    ensure_home()
    path.write_text(text, encoding="utf-8")
    path.chmod(0o600)


def ensure_state_file(path: Path) -> None:
    ensure_home()
    path.touch(mode=0o600, exist_ok=True)
    path.chmod(0o600)
