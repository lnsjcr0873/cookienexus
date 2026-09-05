import json
import urllib.request
import urllib.error
import urllib.parse
from typing import List, Dict, Any, Optional
from .crypto import CryptoEngine

class CookieNexusClient:
    def __init__(self, hub_url: str, vault_id: str, password: str, api_token: Optional[str] = None):
        self.hub_url = hub_url.rstrip('/')
        self.vault_id = vault_id
        self.password = password
        self.api_token = api_token

    def get_cookies(self, domain_filter: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Fetches and decrypts all cookies from the remote zero-knowledge vault.
        """
        url = f"{self.hub_url}/api/v1/vault/{urllib.parse.quote(self.vault_id)}"
        req = urllib.request.Request(url)
        req.add_header('Accept', 'application/json')
        if self.api_token:
            req.add_header('Authorization', f'Bearer {self.api_token}')

        try:
            with urllib.request.urlopen(req, timeout=10) as response:
                payload = json.loads(response.read().decode('utf-8'))
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return []
            raise RuntimeError(f"Failed to fetch vault: HTTP {e.code}")

        all_cookies = CryptoEngine.decrypt_vault(payload, self.password)
        if not domain_filter:
            return all_cookies

        clean_filter = domain_filter.lower().lstrip('.')
        matched = []
        for c in all_cookies:
            c_domain = c.get('domain', '').lower().lstrip('.')
            if c_domain == clean_filter or c_domain.endswith('.' + clean_filter):
                matched.append(c)
        return matched

    def push_cookies(self, cookies: List[Dict[str, Any]]) -> None:
        """
        Encrypts and updates the remote vault.
        """
        url = f"{self.hub_url}/api/v1/vault/{urllib.parse.quote(self.vault_id)}"
        payload = CryptoEngine.encrypt_vault(cookies, self.password, self.vault_id)
        raw_data = json.dumps(payload).encode('utf-8')

        req = urllib.request.Request(url, data=raw_data, method='POST')
        req.add_header('Content-Type', 'application/json')
        if self.api_token:
            req.add_header('Authorization', f'Bearer {self.api_token}')

        with urllib.request.urlopen(req, timeout=10) as response:
            if response.status not in (200, 201):
                raise RuntimeError(f"Failed to save vault: HTTP {response.status}")

    def get_cookie_header(self, domain: str) -> str:
        """
        Returns an HTTP Cookie header string: 'name1=val1; name2=val2'
        """
        cookies = self.get_cookies(domain)
        return "; ".join(f"{c['name']}={c['value']}" for c in cookies)

    def get_playwright_storage_state(self, domain: Optional[str] = None) -> Dict[str, Any]:
        """
        Generates storageState dict for Playwright `browser.new_context(storage_state=...)`
        """
        cookies = self.get_cookies(domain)
        playwright_cookies = []
        for c in cookies:
            playwright_cookies.append({
                "name": c["name"],
                "value": c["value"],
                "domain": c["domain"],
                "path": c.get("path", "/"),
                "expires": c.get("expirationDate", -1),
                "httpOnly": bool(c.get("httpOnly", False)),
                "secure": bool(c.get("secure", False)),
                "sameSite": c.get("sameSite", "Lax").capitalize() if c.get("sameSite") in ("Strict", "Lax", "None") else "Lax",
            })
        return {"cookies": playwright_cookies, "origins": []}
