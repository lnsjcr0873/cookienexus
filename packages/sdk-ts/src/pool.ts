import { CookieNexusClient } from './client.js';

export interface PoolAccount {
  accountId: string;
  vaultId: string;
  domain: string;
  weight?: number;
  lastUsed?: number;
  usageCount: number;
}

export type RotationStrategy = 'round_robin' | 'random' | 'least_used';

export class CookiePool {
  private accounts: PoolAccount[] = [];
  private currentIndex: number = 0;

  constructor(private client: CookieNexusClient) {}

  public addAccount(accountId: string, vaultId: string, domain: string, weight: number = 1) {
    this.accounts.push({
      accountId,
      vaultId,
      domain,
      weight,
      usageCount: 0,
      lastUsed: 0,
    });
  }

  public async acquireSession(strategy: RotationStrategy = 'round_robin'): Promise<{ account: PoolAccount; cookies: any[] }> {
    if (this.accounts.length === 0) {
      throw new Error('No accounts registered in CookiePool');
    }

    let selected: PoolAccount;

    if (strategy === 'random') {
      const idx = Math.floor(Math.random() * this.accounts.length);
      selected = this.accounts[idx];
    } else if (strategy === 'least_used') {
      selected = [...this.accounts].sort((a, b) => a.usageCount - b.usageCount)[0];
    } else {
      // round_robin
      selected = this.accounts[this.currentIndex];
      this.currentIndex = (this.currentIndex + 1) % this.accounts.length;
    }

    selected.usageCount++;
    selected.lastUsed = Date.now();

    const cookies = await this.client.getCookies(selected.domain);
    return { account: selected, cookies };
  }

  public getStats() {
    return this.accounts.map(a => ({
      accountId: a.accountId,
      vaultId: a.vaultId,
      usageCount: a.usageCount,
      lastUsed: a.lastUsed ? new Date(a.lastUsed).toISOString() : 'never',
    }));
  }
}
