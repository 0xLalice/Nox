from __future__ import annotations

import argparse
import asyncio
import logging
import sys
from pathlib import Path

from .config import Config, initialize, replace_token, with_revoked
from .crypto import certificate_fingerprint, format_fingerprint
from .paths import config_path, ensure_state_file, log_path, queue_path, secure_write
from .queue import append_message, cleanup_expired, read_pending
from .server import serve


def _print_pairing(public_url: str, secret: str, fingerprint: str = "") -> None:
    print("Nox pairing values")
    print("==================")
    print(f"WebSocket URL: {public_url}")
    print(f"Pairing secret: {secret}")
    if fingerprint:
        print(f"Certificate fingerprint: {format_fingerprint(fingerprint)}")
    print()
    print("Copy the pairing secret into the GNOME extension now.")
    print("It is not stored and cannot be shown again. If it is lost, run: nox token rotate")


def cmd_init(args: argparse.Namespace) -> int:
    secret, fingerprint = initialize(public_url=args.public_url, bind=args.bind)
    print(f"Nox initialized at {config_path()}")
    _print_pairing(args.public_url, secret, fingerprint)
    return 0


def cmd_send(args: argparse.Namespace) -> int:
    cfg = Config.from_file()
    message = append_message(args.message, cfg)
    print(message.id)
    return 0


def cmd_serve(args: argparse.Namespace) -> int:
    ensure_state_file(log_path())
    logging.basicConfig(filename=str(log_path()), level=logging.INFO, format="%(asctime)s %(levelname)s [Nox] %(message)s")
    cfg = Config.from_file()
    cleanup_expired()
    asyncio.run(serve(cfg, queue_path()))
    return 0


def cmd_status(args: argparse.Namespace) -> int:
    cfg = Config.from_file()
    pending = read_pending()
    print(f"bind={cfg.bind}")
    print(f"publicUrl={cfg.public_url}")
    print(f"revoked={cfg.revoked}")
    print(f"queueDepth={len(pending)}")
    if cfg.tls_cert:
        print(f"certFingerprint={format_fingerprint(certificate_fingerprint(Path(cfg.tls_cert)))}")
    return 0


def cmd_rotate(args: argparse.Namespace) -> int:
    cfg = Config.from_file()
    secret = replace_token(cfg)
    print(f"New pairing secret: {secret}")
    print("Copy it now. It is not stored and cannot be shown again.")
    return 0


def cmd_revoke(args: argparse.Namespace) -> int:
    secure_write(config_path(), with_revoked(Config.from_file(), True).to_json())
    print("revoked")
    return 0


def cmd_fingerprint(args: argparse.Namespace) -> int:
    cfg = Config.from_file()
    if not cfg.tls_cert:
        print("no TLS certificate configured", file=sys.stderr)
        return 2
    print(format_fingerprint(certificate_fingerprint(Path(cfg.tls_cert))))
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="nox")
    sub = parser.add_subparsers(required=True)

    init = sub.add_parser("init", help="create ~/.nox config, queue, token verifier, and TLS files")
    init.add_argument("--public-url", required=True)
    init.add_argument("--bind", default="0.0.0.0:8765")
    init.set_defaults(func=cmd_init)

    send = sub.add_parser("send", help="queue a desktop notification")
    send.add_argument("message")
    send.set_defaults(func=cmd_send)

    serve_cmd = sub.add_parser("serve", help="run the WebSocket backend")
    serve_cmd.set_defaults(func=cmd_serve)

    status = sub.add_parser("status", help="print backend state")
    status.set_defaults(func=cmd_status)

    token = sub.add_parser("token", help="manage the pairing secret")
    token_sub = token.add_subparsers(required=True)
    rotate = token_sub.add_parser("rotate", help="generate a new one-time pairing secret")
    rotate.set_defaults(func=cmd_rotate)
    revoke = token_sub.add_parser("revoke", help="disable desktop connections")
    revoke.set_defaults(func=cmd_revoke)

    cert = sub.add_parser("cert", help="inspect TLS certificate")
    cert_sub = cert.add_subparsers(required=True)
    fingerprint = cert_sub.add_parser("fingerprint", help="print TLS certificate SHA256 fingerprint")
    fingerprint.set_defaults(func=cmd_fingerprint)
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        return args.func(args)
    except FileNotFoundError:
        print("Nox is not initialized. Run: nox init --public-url wss://HOST:8765/nox/ws", file=sys.stderr)
        return 2
    except ValueError as exc:
        print(f"nox: {exc}", file=sys.stderr)
        return 2
