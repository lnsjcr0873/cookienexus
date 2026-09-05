from typing import Optional, Dict, Any
from .client import CookieNexusClient

class SessionManager:
    """
    Session Manager to inject CookieNexus cookies into HTTP client sessions.
    """
    def __init__(self, client: CookieNexusClient):
        self.client = client

    def inject_httpx(self, httpx_client: Any, domain: str, vault_id: Optional[str] = None) -> None:
        """
        Injects cookies directly into an httpx.Client or httpx.AsyncClient.
        """
        cookies = self.client.get_cookies(domain, vault_id=vault_id)
        for c in cookies:
            httpx_client.cookies.set(c['name'], c['value'], domain=c.get('domain'), path=c.get('path', '/'))

    def inject_requests(self, requests_session: Any, domain: str, vault_id: Optional[str] = None) -> None:
        """
        Injects cookies directly into a requests.Session.
        """
        cookies = self.client.get_cookies(domain, vault_id=vault_id)
        for c in cookies:
            requests_session.cookies.set(c['name'], c['value'], domain=c.get('domain'), path=c.get('path', '/'))
