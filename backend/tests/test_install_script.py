from __future__ import annotations

import unittest
from pathlib import Path


class InstallScriptTest(unittest.TestCase):
    def test_backend_installer_documents_venv_and_shim(self):
        source = Path("backend/install.sh").read_text(encoding="utf-8")
        self.assertIn("$HOME/.nox", source)
        self.assertIn("python3 -m venv", source)
        self.assertIn("sysconfig.get_paths()", source)
        self.assertIn("cp -a", source)
        self.assertIn("$HOME/.local/bin", source)
        self.assertIn("ln -sfn", source)
        self.assertIn("$HOME/.config/systemd/user", source)
        self.assertIn("nox.service", source)
        self.assertIn("Environment=NOX_HOME=$nox_home", source)
        self.assertIn("ExecStart=$venv_dir/bin/nox serve", source)
        self.assertIn("Restart=on-failure", source)
        self.assertIn("installed only the backend on this agent machine", source)
        self.assertIn("Do not install the GNOME extension on this agent machine", source)
        self.assertIn("Do not run install-extension.sh or gnome-extensions on this agent machine", source)
        self.assertIn("Do not create local visual previews, demos, screenshots, or GNOME substitutes on this backend-only machine", source)
        self.assertIn("Do not queue or send test messages until the human has installed the extension and saved preferences", source)
        self.assertIn("Stop after backend init/service start on this agent machine", source)
        self.assertIn("Relay the Human GNOME Desktop instructions from AGENT_INSTALL.md; do not execute them here", source)
        self.assertIn("Agent machine flow: backend/install.sh -> nox init -> systemctl --user enable --now nox.service", source)
        self.assertIn("Human GNOME desktop flow: curl -fsSL https://raw.githubusercontent.com/0xLalice/Nox/main/install-extension.sh | bash -> enable extension -> paste URL/secret/fingerprint", source)
        self.assertIn("Open 8765/tcp", source)
        self.assertIn("nox init --public-url wss://PUBLIC_IP_OR_HOSTNAME:8765/nox/ws", source)
        self.assertIn("Immediately relay the WebSocket URL, pairing secret, and certificate fingerprint to the human before doing anything else", source)
        self.assertIn("Invite the human to run exactly this command on the Human GNOME Desktop", source)
        self.assertIn("curl -fsSL https://raw.githubusercontent.com/0xLalice/Nox/main/install-extension.sh | bash", source)
        self.assertIn("If the pairing secret is lost before pairing, the agent must run: nox token rotate", source)
        self.assertIn("Then relay the new secret to the human", source)
        self.assertIn("systemctl --user daemon-reload", source)
        self.assertIn("systemctl --user enable --now nox.service", source)
        self.assertIn("systemctl --user status nox.service --no-pager", source)
        self.assertIn('loginctl enable-linger "\\$USER"', source)
        self.assertIn("certificate fingerprint", source)
        self.assertIn("uses this remote WSS URL and certificate fingerprint for pairing", source)
        for forbidden in [
            "Local development only",
            "ws://127.0.0.1",
            "localhost",
            "loopback",
            "same-machine",
            "SSH tunnel",
            "tunnel",
        ]:
            self.assertNotIn(forbidden, source)
        self.assertNotIn("pip install", source)
        self.assertNotIn("latest-desktop-token", source)
        self.assertNotIn("token.txt", source)


if __name__ == "__main__":
    unittest.main()
