from typing import Optional, Dict, Any, List
from .client import CookieNexusClient

class SessionManager:
    """
    Session Manager to inject CookieNexus cookies into HTTP client and browser automation sessions.
    """
    def __init__(self, client: CookieNexusClient):
        self.client = client

    def inject_httpx(self, httpx_client: Any, domain: str, vault_id: Optional[str] = None) -> None:
        """
        Injects cookies directly into an httpx.Client or httpx.AsyncClient.
        """
        cookies = self.client.get_cookies(domain, vault_id=vault_id)
        for c in cookies:
            dom = c.get('domain') or domain.lstrip('.')
            httpx_client.cookies.set(c['name'], c['value'], domain=dom, path=c.get('path') or '/')

    def inject_requests(self, requests_session: Any, domain: str, vault_id: Optional[str] = None) -> None:
        """
        Injects cookies directly into a requests.Session.
        """
        cookies = self.client.get_cookies(domain, vault_id=vault_id)
        for c in cookies:
            dom = c.get('domain') or domain.lstrip('.')
            requests_session.cookies.set(c['name'], c['value'], domain=dom, path=c.get('path') or '/')

    def inject_aiohttp(self, aiohttp_session: Any, domain: str, vault_id: Optional[str] = None) -> None:
        """
        Injects cookies into an aiohttp.ClientSession.
        """
        cookies = self.client.get_cookies(domain, vault_id=vault_id)
        cookie_dict = {c['name']: c['value'] for c in cookies}
        aiohttp_session.cookie_jar.update_cookies(cookie_dict)

    def inject_playwright(self, context_or_page: Any, domain: Optional[str] = None, vault_id: Optional[str] = None) -> None:
        """
        Injects cookies into a Playwright BrowserContext or Page.
        """
        pw_state = self.client.get_playwright_storage_state(domain=domain, vault_id=vault_id)
        target = getattr(context_or_page, 'context', context_or_page)
        if hasattr(target, 'add_cookies'):
            target.add_cookies(pw_state['cookies'])

    def inject_selenium(self, driver: Any, domain: Optional[str] = None, vault_id: Optional[str] = None) -> None:
        """
        Injects cookies into a Selenium WebDriver instance.
        """
        cookies = self.client.get_cookies(domain=domain, vault_id=vault_id)
        for c in cookies:
            cookie_dict: Dict[str, Any] = {
                'name': c['name'],
                'value': c['value'],
                'path': c.get('path') or '/',
                'secure': bool(c.get('secure', False)),
                'httpOnly': bool(c.get('httpOnly', False)),
            }
            if c.get('domain'):
                cookie_dict['domain'] = c['domain']
            if c.get('expirationDate'):
                cookie_dict['expiry'] = int(c['expirationDate'])
            try:
                driver.add_cookie(cookie_dict)
            except Exception:
                pass
