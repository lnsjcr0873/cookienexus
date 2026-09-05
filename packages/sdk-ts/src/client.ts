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
  async getCookies(domainFilter?: string, vaultIdOverride?: string): Promise<any[]> {
    const targetVault = vaultIdOverride || this.options.vaultId;
    const hubBase = this.options.hubUrl.replace(/\/+$/, '');
    const url = `${hubBase}/api/v1/vault/${encodeURIComponent(targetVault)}`;

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
  async pushCookies(cookies: any[], vaultIdOverride?: string): Promise<void> {
    const targetVault = vaultIdOverride || this.options.vaultId;
    const hubBase = this.options.hubUrl.replace(/\/+$/, '');
    const url = `${hubBase}/api/v1/vault/${encodeURIComponent(targetVault)}`;

    const payload = SDKCrypto.encryptVault(cookies, this.options.password, targetVault);
    await this.httpPost(url, payload);
  }

  /**
   * Generates a Cookie Header string (e.g. "session_id=xyz; token=abc")
   */
  async getCookieHeader(domain: string, vaultIdOverride?: string): Promise<string> {
    const cookies = await this.getCookies(domain, vaultIdOverride);
    return cookies.map((c: any) => `${c.name}=${c.value}`).join('; ');
  }

  /**
   * Generates Playwright storageState JSON object for direct browser context initialization.
   */
  async getPlaywrightStorageState(domain?: string, vaultIdOverride?: string): Promise<{ cookies: any[]; origins: any[] }> {
    const cookies = await this.getCookies(domain, vaultIdOverride);
    const playwrightCookies = cookies.map((c: any) => {
      const s = (c.sameSite || 'Lax').toLowerCase();
      const sameSiteVal = s === 'strict' ? 'Strict' : s === 'none' ? 'None' : 'Lax';
      return {
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path || '/',
        expires: c.expirationDate || -1,
        httpOnly: !!c.httpOnly,
        secure: !!c.secure,
        sameSite: sameSiteVal,
      };
    });

    return {
      cookies: playwrightCookies,
      origins: [],
    };
  }

  /**
   * Generates cURL command string with cookie headers.
   */
  async getCurlCommand(domain?: string, targetUrl: string = 'https://example.com', vaultIdOverride?: string): Promise<string> {
    const cookies = await this.getCookies(domain, vaultIdOverride);
    const headerStr = cookies.map((c: any) => `${c.name}=${c.value}`).join('; ');
    return `curl -b "${headerStr}" "${targetUrl}"`;
  }

  /**
   * Lists all vault IDs stored on the central Hub.
   */
  async listVaults(): Promise<string[]> {
    const hubBase = this.options.hubUrl.replace(/\/+$/, '');
    const url = `${hubBase}/api/v1/vaults`;
    const result = await this.httpGet<string[]>(url);
    return result || [];
  }

  /**
   * Deletes a vault from the central Hub.
   */
  async deleteVault(vaultIdOverride?: string): Promise<boolean> {
    const targetVault = vaultIdOverride || this.options.vaultId;
    const hubBase = this.options.hubUrl.replace(/\/+$/, '');
    const url = `${hubBase}/api/v1/vault/${encodeURIComponent(targetVault)}`;
    return this.httpDelete(url);
  }

  /**
   * Lists all registered session health probes.
   */
  async listProbes(): Promise<any[]> {
    const hubBase = this.options.hubUrl.replace(/\/+$/, '');
    const url = `${hubBase}/api/v1/probes`;
    const result = await this.httpGet<any[]>(url);
    return result || [];
  }

  /**
   * Registers a new session health probe.
   */
  async registerProbe(probe: any): Promise<any> {
    const hubBase = this.options.hubUrl.replace(/\/+$/, '');
    const url = `${hubBase}/api/v1/probes`;
    return this.httpPost<any>(url, probe);
  }

  /**
   * Deletes a registered session health probe.
   */
  async deleteProbe(probeId: string): Promise<boolean> {
    const hubBase = this.options.hubUrl.replace(/\/+$/, '');
    const url = `${hubBase}/api/v1/probes/${encodeURIComponent(probeId)}`;
    return this.httpDelete(url);
  }

  /**
   * Triggers an immediate execution check for a registered session probe.
   */
  async checkProbe(probeId: string): Promise<any> {
    const hubBase = this.options.hubUrl.replace(/\/+$/, '');
    const url = `${hubBase}/api/v1/probes/check/${encodeURIComponent(probeId)}`;
    return this.httpPost<any>(url, {});
  }

  /**
   * Fetches recent audit trail logs from the Hub.
   */
  async getAuditLogs(limit: number = 100): Promise<any[]> {
    const hubBase = this.options.hubUrl.replace(/\/+$/, '');
    const url = `${hubBase}/api/v1/audit/logs`;
    const result = await this.httpGet<any[]>(url);
    return result ? result.slice(0, limit) : [];
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
          if (res.statusCode === 404) {
            resolve(null as any);
            return;
          }
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

  private httpDelete(urlStr: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const u = new URL(urlStr);
      const client = u.protocol === 'https:' ? https : http;
      const headers: Record<string, string> = { 'Accept': 'application/json' };
      if (this.options.apiToken) headers['Authorization'] = `Bearer ${this.options.apiToken}`;

      const req = client.request(u, { method: 'DELETE', headers }, (res) => {
        if (res.statusCode === 200 || res.statusCode === 204) {
          resolve(true);
        } else if (res.statusCode === 404) {
          resolve(false);
        } else {
          reject(new Error(`HTTP ${res.statusCode}`));
        }
      });
      req.on('error', reject);
      req.end();
    });
  }
}
