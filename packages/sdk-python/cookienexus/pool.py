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
        self.status = "ACTIVE"  # "ACTIVE", "EXPIRED", "COOLDOWN"
        self.cooldown_until = 0.0

class CookiePool:
    def __init__(self, client: CookieNexusClient):
        self.client = client
        self.accounts: List[PoolAccount] = []
        self._current_index = 0

    def add_account(self, account_id: str, vault_id: str, domain: str, weight: int = 1) -> None:
        self.accounts.append(PoolAccount(account_id, vault_id, domain, weight))

    def remove_account(self, account_id: str) -> bool:
        for idx, acc in enumerate(self.accounts):
            if acc.account_id == account_id:
                self.accounts.pop(idx)
                if self._current_index >= len(self.accounts):
                    self._current_index = 0
                return True
        return False

    def mark_expired(self, account_id: str) -> None:
        for acc in self.accounts:
            if acc.account_id == account_id:
                acc.status = "EXPIRED"

    def mark_cooldown(self, account_id: str, duration_seconds: float = 300) -> None:
        for acc in self.accounts:
            if acc.account_id == account_id:
                acc.status = "COOLDOWN"
                acc.cooldown_until = time.time() + duration_seconds

    def mark_healthy(self, account_id: str) -> None:
        for acc in self.accounts:
            if acc.account_id == account_id:
                acc.status = "ACTIVE"
                acc.cooldown_until = 0.0

    def acquire_session(self, strategy: str = "round_robin", allow_cooldown: bool = False) -> Dict[str, Any]:
        if not self.accounts:
            raise ValueError("No accounts available in pool")

        now = time.time()
        # Recover expired cooldowns
        for acc in self.accounts:
            if acc.status == "COOLDOWN" and acc.cooldown_until <= now:
                acc.status = "ACTIVE"
                acc.cooldown_until = 0.0

        available = [a for a in self.accounts if a.status == "ACTIVE" or (allow_cooldown and a.status == "COOLDOWN")]
        if not available:
            available = self.accounts  # Fallback

        if strategy == "random":
            weights = [max(a.weight, 1) for a in available]
            selected = random.choices(available, weights=weights, k=1)[0]
        elif strategy == "least_used":
            selected = min(available, key=lambda a: a.usage_count)
        else:
            # round_robin
            selected = available[self._current_index % len(available)]
            self._current_index = (self._current_index + 1) % len(available)

        selected.usage_count += 1
        selected.last_used = time.time()

        cookies = self.client.get_cookies(selected.domain, vault_id=selected.vault_id)

        return {
            "account_id": selected.account_id,
            "vault_id": selected.vault_id,
            "domain": selected.domain,
            "cookies": cookies,
            "cookie_header": "; ".join(f"{c['name']}={c['value']}" for c in cookies),
            "status": selected.status
        }

    def get_stats(self) -> List[Dict[str, Any]]:
        return [{
            "account_id": a.account_id,
            "vault_id": a.vault_id,
            "domain": a.domain,
            "weight": a.weight,
            "usage_count": a.usage_count,
            "status": a.status,
            "last_used": a.last_used
        } for a in self.accounts]
