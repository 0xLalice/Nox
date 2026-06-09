from __future__ import annotations

import json
import os
import tempfile
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path

from .config import Config
from .paths import ensure_home, queue_path


@dataclass(frozen=True)
class Message:
    id: str
    text: str
    created_at: str
    expires_at: str

    def to_record(self) -> dict[str, str]:
        return {"id": self.id, "text": self.text, "createdAt": self.created_at, "expiresAt": self.expires_at}


def _now() -> datetime:
    return datetime.now(UTC)


def _parse_time(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def read_pending(path: Path | None = None, now: datetime | None = None) -> list[dict]:
    path = path or queue_path()
    now = now or _now()
    if not path.exists():
        return []
    pending: list[dict] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        try:
            item = json.loads(line)
            if _parse_time(item["expiresAt"]) > now:
                pending.append(item)
        except Exception:
            continue
    return pending


def rewrite_pending(messages: list[dict], path: Path | None = None) -> None:
    path = path or queue_path()
    ensure_home()
    fd, tmp_name = tempfile.mkstemp(prefix="queue.", suffix=".jsonl", dir=str(path.parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fp:
            for item in messages:
                fp.write(json.dumps(item, separators=(",", ":")) + "\n")
        os.chmod(tmp_name, 0o600)
        os.replace(tmp_name, path)
        path.chmod(0o600)
    finally:
        if os.path.exists(tmp_name):
            os.unlink(tmp_name)


def cleanup_expired(path: Path | None = None) -> list[dict]:
    pending = read_pending(path)
    rewrite_pending(pending, path)
    return pending


def append_message(text: str, cfg: Config, path: Path | None = None) -> Message:
    path = path or queue_path()
    text = text.strip()
    if not text:
        raise ValueError("message is empty")
    if len(text) > cfg.max_message_chars:
        raise ValueError(f"message exceeds {cfg.max_message_chars} characters")
    pending = cleanup_expired(path)
    if len(pending) >= cfg.max_queue_messages:
        raise ValueError(f"queue already has {cfg.max_queue_messages} pending messages")
    created = _now()
    message = Message(
        id=str(uuid.uuid4()),
        text=text,
        created_at=created.isoformat(timespec="seconds").replace("+00:00", "Z"),
        expires_at=(created + timedelta(seconds=cfg.message_ttl_seconds)).isoformat(timespec="seconds").replace("+00:00", "Z"),
    )
    ensure_home()
    with path.open("a", encoding="utf-8") as fp:
        fp.write(json.dumps(message.to_record(), separators=(",", ":")) + "\n")
    path.chmod(0o600)
    return message


def acknowledge_through(last_id: str, path: Path | None = None) -> int:
    pending = read_pending(path)
    remove_count = 0
    for index, item in enumerate(pending):
        if item.get("id") == last_id:
            remove_count = index + 1
            break
    if remove_count:
        rewrite_pending(pending[remove_count:], path)
    return remove_count
