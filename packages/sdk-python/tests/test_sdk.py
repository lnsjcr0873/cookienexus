import sys
import os
import unittest

# Add package to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from cookienexus.crypto import CryptoEngine
from cookienexus.client import CookieNexusClient
from cookienexus.pool import CookiePool

class TestCookieNexusPythonSDK(unittest.TestCase):
    def test_crypto_roundtrip(self):
        password = "Master'Pass\"with\\Special/Chars!@#$%^&*()_+"
        vault_id = "test_vault"
        cookies = [
            {"domain": "github.com", "name": "user_session", "value": "gh_12345", "secure": True, "httpOnly": True},
            {"domain": "weibo.com", "name": "SUB", "value": "sub_token_67890", "secure": False, "httpOnly": False}
        ]

        payload = CryptoEngine.encrypt_vault(cookies, password, vault_id)
        self.assertEqual(payload["vaultId"], vault_id)
        self.assertIn("ciphertext", payload)
        self.assertIn("salt", payload)

        decrypted = CryptoEngine.decrypt_vault(payload, password)
        self.assertEqual(len(decrypted), 2)
        self.assertEqual(decrypted[0]["name"], "user_session")
        self.assertEqual(decrypted[0]["value"], "gh_12345")

    def test_pool_rotation(self):
        # Mock client
        client = CookieNexusClient("http://127.0.0.1:8765", "v1", "pwd")
        pool = CookiePool(client)
        pool.add_account("acc1", "v1", "github.com")
        pool.add_account("acc2", "v2", "github.com")

        self.assertEqual(len(pool.accounts), 2)
        self.assertEqual(pool.accounts[0].account_id, "acc1")

if __name__ == '__main__':
    unittest.main()
