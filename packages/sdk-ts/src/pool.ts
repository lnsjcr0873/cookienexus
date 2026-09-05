import { CookieNexusClient } from './client.js';

export interface PoolAccount {
  accountId: string;
  vaultId: string;
  domain: string;
  weight?: number;
  lastUsed?: number;
  usageCount: number;
  status: 'ACTIVE' | 'EXPIRED' | 'COOLDOWN';
  cooldownUntil?: number;
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
      status: 'ACTIVE',
    });
  }

  public getAccount(accountId: string): PoolAccount | undefined {
    return this.accounts.find(a => a.accountId === accountId);
  }

  public clear(): void {
    this.accounts = [];
    this.currentIndex = 0;
  }

  public removeAccount(accountId: string): boolean {
    const idx = this.accounts.findIndex(a => a.accountId === accountId);
    if (idx !== -1) {
      this.accounts.splice(idx, 1);
      if (this.currentIndex >= this.accounts.length) {
        this.currentIndex = 0;
      }
      return true;
    }
    return false;
  }

  public markExpired(accountId: string) {
    const acc = this.accounts.find(a => a.accountId === accountId);
    if (acc) {
      acc.status = 'EXPIRED';
    }
  }

  public markCooldown(accountId: string, durationSeconds: number = 300) {
    const acc = this.accounts.find(a => a.accountId === accountId);
    if (acc) {
      acc.status = 'COOLDOWN';
      acc.cooldownUntil = Date.now() + durationSeconds * 1000;
    }
  }

  public markHealthy(accountId: string) {
    const acc = this.accounts.find(a => a.accountId === accountId);
    if (acc) {
      acc.status = 'ACTIVE';
      acc.cooldownUntil = undefined;
    }
  }

  public async acquireSession(strategy: RotationStrategy = 'round_robin', allowCooldown: boolean = false): Promise<{ account: PoolAccount; accountId: string; vaultId: string; domain: string; cookies: any[]; cookieHeader: string }> {
    if (this.accounts.length === 0) {
      throw new Error('No accounts registered in CookiePool');
    }

    const now = Date.now();
    // Auto-recover expired cooldowns
    for (const acc of this.accounts) {
      if (acc.status === 'COOLDOWN' && acc.cooldownUntil && acc.cooldownUntil <= now) {
        acc.status = 'ACTIVE';
        acc.cooldownUntil = undefined;
      }
    }

    // Filter available candidates
    let available = this.accounts.filter(a => a.status === 'ACTIVE' || (allowCooldown && a.status === 'COOLDOWN'));
    if (available.length === 0) {
      // Fallback: If all are marked expired/cooldown, allow any non-empty candidate or throw
      available = this.accounts;
    }

    let selected: PoolAccount;

    if (strategy === 'random') {
      const totalWeight = available.reduce((sum, a) => sum + Math.max(a.weight || 1, 1), 0);
      let randomVal = Math.random() * totalWeight;
      selected = available[0];
      for (const account of available) {
        const w = Math.max(account.weight || 1, 1);
        if (randomVal < w) {
          selected = account;
          break;
        }
        randomVal -= w;
      }
    } else if (strategy === 'least_used') {
      selected = [...available].sort((a, b) => a.usageCount - b.usageCount)[0];
    } else {
      // round_robin
      selected = available[this.currentIndex % available.length];
      this.currentIndex = (this.currentIndex + 1) % available.length;
    }

    selected.usageCount++;
    selected.lastUsed = Date.now();

    const cookies = await this.client.getCookies(selected.domain, selected.vaultId);
    const cookieHeader = cookies.map((c: any) => `${c.name}=${c.value}`).join('; ');

    return {
      account: selected,
      accountId: selected.accountId,
      vaultId: selected.vaultId,
      domain: selected.domain,
      cookies,
      cookieHeader
    };
  }

  public getStats() {
    return this.accounts.map(a => ({
      accountId: a.accountId,
      vaultId: a.vaultId,
      domain: a.domain,
      weight: a.weight || 1,
      usageCount: a.usageCount,
      status: a.status,
      lastUsed: a.lastUsed ? new Date(a.lastUsed).toISOString() : 'never',
    }));
  }
}
