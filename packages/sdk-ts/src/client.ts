import http from 'node:http';
import https from 'node:https';
import { URL } from 'node:url';
import { SDKCrypto, EncryptedVaultPayload } from './crypto.js';

export interface CookieNexusClientOptions {
  hubUrl: string;       // e.g. "http://localhost:8765"
  vaultId: string;      // e.g. "default_vault"
  password: string;     // E2EE Master password
  apiToken?: string;    // Optional RBAC bearer token
}

export class CookieNexusClient {
  constructor(private options: CookieNexusClientOptions) {}

  /**
   * Fetches and decrypts all cookies for the configured vault.
   */
  async getCookies(domainFilter?: string): Promise<any[]> {
    const hubBase = this.options.hubUrl.replace(/\/+$/, '');
    const url = `${hubBase}/api/v1/vault/${encodeURIComponent(this.options.vaultId)}`;

    const envelope = await this.httpGet<EncryptedVaultPayload>(url);
    if (!envelope || !envelope.ciphertext) {
      return [];
    }

    const allCookies = SDKCrypto.decryptVault(envelope, this.options.password);
    if (!domainFilter) {
      return allCookies;
    }

    const cleanFilter = domainFilter.toLowerCase().replace(/^\./, '');
    return allCookies.filter((c: any) => {
      const cDomain = (c.domain || '').toLowerCase().replace(/^\./, '');
      return cDomain === cleanFilter || cDomain.endsWith('.' + cleanFilter);
    });
  }

  /**
   * Encrypts and pushes a new cookie set to the central Hub.
   */
  async pushCookies(cookies: any[]): Promise<void> {
    const hubBase = this.options.hubUrl.replace(/\/+$/, '');
    const url = `${hubBase}/api/v1/vault/${encodeURIComponent(this.options.vaultId)}`;

    const payload = SDKCrypto.encryptVault(cookies, this.options.password, this.options.vaultId);
    await this.httpPost(url, payload);
  }

  /**
   * Generates a Cookie Header string (e.g. "session_id=xyz; token=abc")
   */
  async getCookieHeader(domain: string): Promise<string> {
    const cookies = await this.getCookies(domain);
    return cookies.map((c: any) => `${c.name}=${c.value}`).join('; ');
  }

  /**
   * Generates Playwright storageState JSON object for direct browser context initialization.
   */
  async getPlaywrightStorageState(domain?: string): Promise<{ cookies: any[]; origins: any[] }> {
    const cookies = await this.getCookies(domain);
    const playwrightCookies = cookies.map((c: any) => ({
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path || '/',
      expires: c.expirationDate || -1,
      httpOnly: !!c.httpOnly,
      secure: !!c.secure,
      sameSite: c.sameSite === 'Strict' ? 'Strict' : c.sameSite === 'Lax' ? 'Lax' : 'None',
    }));

    return {
      cookies: playwrightCookies,
      origins: [],
    };
  }

  private httpGet<T>(urlStr: string): Promise<T> {
    return new Promise((resolve, reject) => {
      const u = new URL(urlStr);
      const client = u.protocol === 'https:' ? https : http;
      const headers: Record<string, string> = { 'Accept': 'application/json' };
      if (this.options.apiToken) headers['Authorization'] = `Bearer ${this.options.apiToken}`;

      client.get(u, { headers }, (res) => {
        let body = '';
        res.on('data', chunk => { body += chunk; });
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${body}`));
          }
        });
      }).on('error', reject);
    });
  }

  private httpPost<T>(urlStr: string, data: any): Promise<T> {
    return new Promise((resolve, reject) => {
      const u = new URL(urlStr);
      const client = u.protocol === 'https:' ? https : http;
      const payload = JSON.stringify(data);
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload).toString(),
      };
      if (this.options.apiToken) headers['Authorization'] = `Bearer ${this.options.apiToken}`;

      const req = client.request(u, { method: 'POST', headers }, (res) => {
        let body = '';
        res.on('data', chunk => { body += chunk; });
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try { resolve(JSON.parse(body || '{}')); } catch (e) { reject(e); }
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${body}`));
          }
        });
      });
      req.on('error', reject);
      req.write(payload);
      req.end();
    });
  }
}
