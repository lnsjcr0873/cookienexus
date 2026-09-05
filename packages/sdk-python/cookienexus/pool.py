import random
import time
from typing import List, Dict, Any, Optional
from .client import CookieNexusClient

class PoolAccount:
    def __init__(self, account_id: str, vault_id: str, domain: str, weight: int = 1):
        self.account_id = account_id
        self.vault_id = vault_id
        self.domain = domain
        self.weight = weight
        self.usage_count = 0
        self.last_used = 0

class CookiePool:
    def __init__(self, client: CookieNexusClient):
        self.client = client
        self.accounts: List[PoolAccount] = []
        self._current_index = 0

    def add_account(self, account_id: str, vault_id: str, domain: str, weight: int = 1) -> None:
        self.accounts.append(PoolAccount(account_id, vault_id, domain, weight))

    def acquire_session(self, strategy: str = "round_robin") -> Dict[str, Any]:
        if not self.accounts:
            raise ValueError("No accounts available in pool")

        if strategy == "random":
            selected = random.choice(self.accounts)
        elif strategy == "least_used":
            selected = min(self.accounts, key=lambda a: a.usage_count)
        else:
            # round_robin
            selected = self.accounts[self._current_index]
            self._current_index = (self._current_index + 1) % len(self.accounts)

        selected.usage_count += 1
        selected.last_used = time.time()

        # Temporarily switch client vault if different
        orig_vault = self.client.vault_id
        self.client.vault_id = selected.vault_id
        try:
            cookies = self.client.get_cookies(selected.domain)
        finally:
            self.client.vault_id = orig_vault

        return {
            "account_id": selected.account_id,
            "vault_id": selected.vault_id,
            "domain": selected.domain,
            "cookies": cookies,
            "cookie_header": "; ".join(f"{c['name']}={c['value']}" for c in cookies)
        }
