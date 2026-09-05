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

    def get_cookies(self, domain_filter: Optional[str] = None, vault_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Fetches and decrypts all cookies from the remote zero-knowledge vault.
        """
        target_vault = vault_id or self.vault_id
        url = f"{self.hub_url}/api/v1/vault/{urllib.parse.quote(target_vault, safe='')}"
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

        if not payload or not isinstance(payload, dict) or not payload.get('ciphertext'):
            return []

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

    def push_cookies(self, cookies: List[Dict[str, Any]], vault_id: Optional[str] = None) -> None:
        """
        Encrypts and updates the remote vault.
        """
        target_vault = vault_id or self.vault_id
        url = f"{self.hub_url}/api/v1/vault/{urllib.parse.quote(target_vault, safe='')}"
        payload = CryptoEngine.encrypt_vault(cookies, self.password, target_vault)
        raw_data = json.dumps(payload).encode('utf-8')

        req = urllib.request.Request(url, data=raw_data, method='POST')
        req.add_header('Content-Type', 'application/json')
        if self.api_token:
            req.add_header('Authorization', f'Bearer {self.api_token}')

        with urllib.request.urlopen(req, timeout=10) as response:
            if response.status not in (200, 201):
                raise RuntimeError(f"Failed to save vault: HTTP {response.status}")

    def get_cookie_header(self, domain: str, vault_id: Optional[str] = None) -> str:
        """
        Returns an HTTP Cookie header string: 'name1=val1; name2=val2'
        """
        cookies = self.get_cookies(domain, vault_id=vault_id)
        return "; ".join(f"{c['name']}={c['value']}" for c in cookies)

    def get_playwright_storage_state(self, domain: Optional[str] = None, vault_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Generates storageState dict for Playwright `browser.new_context(storage_state=...)`
        """
        cookies = self.get_cookies(domain, vault_id=vault_id)
        playwright_cookies = []
        for c in cookies:
            raw_samesite = str(c.get("sameSite", "Lax")).capitalize()
            same_site_val = raw_samesite if raw_samesite in ("Strict", "Lax", "None") else "Lax"
            playwright_cookies.append({
                "name": c["name"],
                "value": c["value"],
                "domain": c["domain"],
                "path": c.get("path", "/"),
                "expires": c.get("expirationDate", -1),
                "httpOnly": bool(c.get("httpOnly", False)),
                "secure": bool(c.get("secure", False)),
                "sameSite": same_site_val,
            })
        return {"cookies": playwright_cookies, "origins": []}

    def get_curl_command(self, domain: Optional[str] = None, url: str = "https://example.com", vault_id: Optional[str] = None) -> str:
        """
        Generates cURL command string with cookie headers.
        """
        cookies = self.get_cookies(domain, vault_id=vault_id)
        header_str = "; ".join(f"{c['name']}={c['value']}" for c in cookies)
        return f'curl -b "{header_str}" "{url}"'

    def list_vaults(self) -> List[str]:
        """
        Lists all active vault IDs on the central Hub.
        """
        url = f"{self.hub_url}/api/v1/vaults"
        req = urllib.request.Request(url)
        req.add_header('Accept', 'application/json')
        if self.api_token:
            req.add_header('Authorization', f'Bearer {self.api_token}')

        try:
            with urllib.request.urlopen(req, timeout=10) as response:
                return json.loads(response.read().decode('utf-8'))
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return []
            raise RuntimeError(f"Failed to list vaults: HTTP {e.code}")

    def delete_vault(self, vault_id: Optional[str] = None) -> bool:
        """
        Deletes a vault from the central Hub.
        """
        target_vault = vault_id or self.vault_id
        url = f"{self.hub_url}/api/v1/vault/{urllib.parse.quote(target_vault, safe='')}"
        req = urllib.request.Request(url, method='DELETE')
        if self.api_token:
            req.add_header('Authorization', f'Bearer {self.api_token}')

        try:
            with urllib.request.urlopen(req, timeout=10) as response:
                return response.status in (200, 204)
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return False
            raise RuntimeError(f"Failed to delete vault: HTTP {e.code}")

    def list_probes(self) -> List[Dict[str, Any]]:
        """
        Lists all registered session health probes on the central Hub.
        """
        url = f"{self.hub_url}/api/v1/probes"
        req = urllib.request.Request(url)
        req.add_header('Accept', 'application/json')
        if self.api_token:
            req.add_header('Authorization', f'Bearer {self.api_token}')

        try:
            with urllib.request.urlopen(req, timeout=10) as response:
                return json.loads(response.read().decode('utf-8'))
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return []
            raise RuntimeError(f"Failed to list probes: HTTP {e.code}")

    def register_probe(self, probe: Dict[str, Any]) -> Dict[str, Any]:
        """
        Registers or updates a session health probe on the central Hub.
        """
        url = f"{self.hub_url}/api/v1/probes"
        raw_data = json.dumps(probe).encode('utf-8')
        req = urllib.request.Request(url, data=raw_data, method='POST')
        req.add_header('Content-Type', 'application/json')
        if self.api_token:
            req.add_header('Authorization', f'Bearer {self.api_token}')

        with urllib.request.urlopen(req, timeout=10) as response:
            if response.status in (200, 201):
                return json.loads(response.read().decode('utf-8'))
            raise RuntimeError(f"Failed to register probe: HTTP {response.status}")

    def delete_probe(self, probe_id: str) -> bool:
        """
        Deletes a session health probe from the central Hub.
        """
        url = f"{self.hub_url}/api/v1/probes/{urllib.parse.quote(probe_id, safe='')}"
        req = urllib.request.Request(url, method='DELETE')
        if self.api_token:
            req.add_header('Authorization', f'Bearer {self.api_token}')

        try:
            with urllib.request.urlopen(req, timeout=10) as response:
                return response.status in (200, 204)
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return False
            raise RuntimeError(f"Failed to delete probe: HTTP {e.code}")

    def check_probe(self, probe_id: str) -> Dict[str, Any]:
        """
        Triggers an immediate execution check for a registered session probe.
        """
        url = f"{self.hub_url}/api/v1/probes/check/{urllib.parse.quote(probe_id, safe='')}"
        req = urllib.request.Request(url, data=b"{}", method='POST')
        req.add_header('Content-Type', 'application/json')
        if self.api_token:
            req.add_header('Authorization', f'Bearer {self.api_token}')

        with urllib.request.urlopen(req, timeout=10) as response:
            if response.status == 200:
                return json.loads(response.read().decode('utf-8'))
            raise RuntimeError(f"Failed to execute probe check: HTTP {response.status}")

    def get_audit_logs(self, limit: int = 100) -> List[Dict[str, Any]]:
        """
        Fetches recent audit trail logs from the central Hub.
        """
        url = f"{self.hub_url}/api/v1/audit/logs"
        req = urllib.request.Request(url)
        req.add_header('Accept', 'application/json')
        if self.api_token:
            req.add_header('Authorization', f'Bearer {self.api_token}')

        try:
            with urllib.request.urlopen(req, timeout=10) as response:
                logs = json.loads(response.read().decode('utf-8'))
                return logs[:limit] if isinstance(logs, list) else []
        except urllib.error.HTTPError as e:
            raise RuntimeError(f"Failed to fetch audit logs: HTTP {e.code}")
