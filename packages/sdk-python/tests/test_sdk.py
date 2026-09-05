import sys
import os
import unittest

# Add package to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from cookienexus.crypto import CryptoEngine
from cookienexus.client import CookieNexusClient
from cookienexus.pool import CookiePool
from cookienexus.session import SessionManager

class TestCookieNexusPythonSDK(unittest.TestCase):
    def test_crypto_roundtrip(self):
        password = "Master'Pass\"with\\Special/Chars!@#$%^&*()_+_🔑_密码"
        vault_id = "test_vault"
        cookies = [
            {"domain": "github.com", "name": "user_session", "value": "gh_12345_🍪", "secure": True, "httpOnly": True, "sameSite": "strict"},
            {"domain": "weibo.com", "name": "SUB", "value": "sub_token_中文_67890", "secure": False, "httpOnly": False, "sameSite": "lax"}
        ]

        payload = CryptoEngine.encrypt_vault(cookies, password, vault_id)
        self.assertEqual(payload["vaultId"], vault_id)
        self.assertIn("ciphertext", payload)
        self.assertIn("salt", payload)

        decrypted = CryptoEngine.decrypt_vault(payload, password)
        self.assertEqual(len(decrypted), 2)
        self.assertEqual(decrypted[0]["name"], "user_session")
        self.assertEqual(decrypted[0]["value"], "gh_12345_🍪")
        self.assertEqual(decrypted[1]["value"], "sub_token_中文_67890")

    def test_pool_rotation(self):
        # Mock client
        client = CookieNexusClient("http://127.0.0.1:8765", "v1", "pwd")
        pool = CookiePool(client)
        pool.add_account("acc1", "v1", "github.com", weight=3)
        pool.add_account("acc2", "v2", "github.com", weight=1)

        pool.mark_cooldown("acc1", 60)
        pool.mark_expired("acc2")

        self.assertEqual(len(pool.accounts), 2)
        self.assertEqual(pool.accounts[0].account_id, "acc1")
        self.assertEqual(pool.accounts[0].status, "COOLDOWN")
        self.assertEqual(pool.accounts[1].status, "EXPIRED")

        pool.mark_healthy("acc1")
        pool.mark_healthy("acc2")
        self.assertEqual(pool.accounts[0].status, "ACTIVE")

    def test_session_manager(self):
        client = CookieNexusClient("http://127.0.0.1:8765", "v1", "pwd")
        sm = SessionManager(client)
        self.assertTrue(hasattr(sm, 'inject_requests'))
        self.assertTrue(hasattr(sm, 'inject_httpx'))
        self.assertTrue(hasattr(sm, 'inject_aiohttp'))
        self.assertTrue(hasattr(sm, 'inject_playwright'))
        self.assertTrue(hasattr(sm, 'inject_selenium'))

if __name__ == '__main__':
    unittest.main()
