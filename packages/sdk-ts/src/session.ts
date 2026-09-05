import { CookieNexusClient } from './client.js';

/**
 * Session Manager to inject CookieNexus cookies into Node.js HTTP clients and browser automation contexts.
 */
export class SessionManager {
  constructor(private client: CookieNexusClient) {}

  /**
   * Generates or injects Cookie header into a headers map/object.
   */
  async injectHeaders(headers: Record<string, string>, domain: string, vaultIdOverride?: string): Promise<Record<string, string>> {
    const headerStr = await this.client.getCookieHeader(domain, vaultIdOverride);
    const updated = { ...headers };
    if (headerStr) {
      updated['Cookie'] = headerStr;
    }
    return updated;
  }

  /**
   * Injects cookies into an Axios instance default headers.
   */
  async injectAxios(axiosInstance: any, domain: string, vaultIdOverride?: string): Promise<void> {
    const headerStr = await this.client.getCookieHeader(domain, vaultIdOverride);
    if (axiosInstance?.defaults?.headers) {
      if (typeof axiosInstance.defaults.headers.set === 'function') {
        axiosInstance.defaults.headers.set('Cookie', headerStr);
      } else {
        axiosInstance.defaults.headers.common = axiosInstance.defaults.headers.common || {};
        axiosInstance.defaults.headers.common['Cookie'] = headerStr;
      }
    }
  }

  /**
   * Injects Cookie header into a Fetch RequestInit options object.
   */
  async injectFetchOptions(init: any = {}, domain: string, vaultIdOverride?: string): Promise<any> {
    const headerStr = await this.client.getCookieHeader(domain, vaultIdOverride);
    const headers = { ...(init.headers || {}) };
    headers['Cookie'] = headerStr;
    return { ...init, headers };
  }

  /**
   * Injects cookies into a Playwright BrowserContext or Page.
   */
  async injectPlaywright(contextOrPage: any, domain?: string, vaultIdOverride?: string): Promise<void> {
    const pwState = await this.client.getPlaywrightStorageState(domain, vaultIdOverride);
    const target = contextOrPage?.context ? contextOrPage.context() : contextOrPage;
    if (target && typeof target.addCookies === 'function') {
      await target.addCookies(pwState.cookies);
    }
  }

  /**
   * Injects cookies into a Puppeteer Page.
   */
  async injectPuppeteer(page: any, domain?: string, vaultIdOverride?: string): Promise<void> {
    const cookies = await this.client.getCookies(domain, vaultIdOverride);
    if (page && typeof page.setCookie === 'function') {
      const puppeteerCookies = cookies.map((c: any) => ({
        name: c.name,
        value: c.value,
        domain: c.domain ? c.domain.replace(/^\./, '') : undefined,
        path: c.path || '/',
        expires: c.expirationDate || undefined,
        httpOnly: !!c.httpOnly,
        secure: !!c.secure,
        sameSite: c.sameSite || 'Lax',
      }));
      await page.setCookie(...puppeteerCookies);
    }
  }
}
