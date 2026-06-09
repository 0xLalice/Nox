from __future__ import annotations

import base64
import hashlib
import hmac
import os
import secrets
import shutil
import subprocess
import tempfile
from pathlib import Path
from urllib.parse import urlparse


def make_secret() -> str:
    return secrets.token_urlsafe(32)


def hash_secret(secret: str, salt: bytes | None = None, rounds: int = 210_000) -> str:
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", secret.encode("utf-8"), salt, rounds)
    return "pbkdf2_sha256$%d$%s$%s" % (
        rounds,
        base64.urlsafe_b64encode(salt).decode("ascii"),
        base64.urlsafe_b64encode(digest).decode("ascii"),
    )


def verify_secret(secret: str, verifier: str) -> bool:
    try:
        algorithm, rounds_text, salt_text, digest_text = verifier.split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        rounds = int(rounds_text)
        salt = base64.urlsafe_b64decode(salt_text.encode("ascii"))
        expected = base64.urlsafe_b64decode(digest_text.encode("ascii"))
        actual = hashlib.pbkdf2_hmac("sha256", secret.encode("utf-8"), salt, rounds)
        return hmac.compare_digest(actual, expected)
    except Exception:
        return False


def _san_for_host(hostname: str) -> str:
    import ipaddress

    try:
        ipaddress.ip_address(hostname)
        return f"IP:{hostname}"
    except ValueError:
        return f"DNS:{hostname}"


def certificate_fingerprint(cert_path: Path) -> str:
    der = subprocess.check_output(["openssl", "x509", "-in", str(cert_path), "-outform", "DER"])
    return hashlib.sha256(der).hexdigest().upper()


def format_fingerprint(fingerprint: str) -> str:
    clean = "".join(ch for ch in fingerprint.upper() if ch in "0123456789ABCDEF")
    return ":".join(clean[index : index + 2] for index in range(0, len(clean), 2))


def generate_self_signed_cert(public_url: str, cert_path: Path, key_path: Path) -> str:
    if not shutil.which("openssl"):
        raise ValueError("openssl is required to generate a self-signed Nox certificate")
    parsed = urlparse(public_url)
    if parsed.scheme != "wss" or not parsed.hostname:
        raise ValueError("certificate generation requires a wss://HOST/nox/ws URL")

    cert_path.parent.mkdir(parents=True, exist_ok=True)
    san = _san_for_host(parsed.hostname)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", delete=False) as fp:
        fp.write(
            "[req]\n"
            "default_bits = 2048\n"
            "prompt = no\n"
            "default_md = sha256\n"
            "distinguished_name = dn\n"
            "x509_extensions = v3_req\n"
            "\n"
            "[dn]\n"
            f"CN = {parsed.hostname}\n"
            "\n"
            "[v3_req]\n"
            f"subjectAltName = {san}\n"
        )
        openssl_config = fp.name

    try:
        subprocess.run(
            [
                "openssl",
                "req",
                "-x509",
                "-newkey",
                "rsa:2048",
                "-sha256",
                "-days",
                "365",
                "-nodes",
                "-keyout",
                str(key_path),
                "-out",
                str(cert_path),
                "-config",
                openssl_config,
            ],
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
    except subprocess.CalledProcessError as exc:
        raise ValueError(f"openssl failed: {exc.stderr.strip()}") from exc
    finally:
        try:
            os.unlink(openssl_config)
        except FileNotFoundError:
            pass

    cert_path.chmod(0o600)
    key_path.chmod(0o600)
    return certificate_fingerprint(cert_path)
