import { UserSession } from '../storage/types.js';

export class RBACManager {
  private users: Map<string, UserSession> = new Map();

  constructor() {
    // Default admin user
    this.addUser({
      userId: 'admin_01',
      username: 'admin',
      role: 'admin',
      allowedDomains: ['*'],
      token: 'nexus_admin_secret_token_2026',
    });
  }

  public addUser(user: UserSession) {
    this.users.set(user.token, user);
  }

  public authenticate(bearerToken: string): UserSession | null {
    const token = bearerToken.replace(/^Bearer\s+/i, '').trim();
    return this.users.get(token) || null;
  }

  public canAccessDomain(user: UserSession, targetDomain: string): boolean {
    if (user.role === 'admin') return true;
    if (user.allowedDomains.includes('*')) return true;

    const lowerTarget = (targetDomain || '').toLowerCase().trim().replace(/^\./, '');
    if (!lowerTarget) return false;

    return user.allowedDomains.some(pattern => {
      let cleanPattern = pattern.toLowerCase().trim();
      if (cleanPattern.startsWith('*.')) {
        cleanPattern = cleanPattern.slice(2);
      }
      cleanPattern = cleanPattern.replace(/^\./, '');
      return lowerTarget === cleanPattern || lowerTarget.endsWith('.' + cleanPattern);
    });
  }

  public canMutate(user: UserSession): boolean {
    return user.role === 'admin' || user.role === 'developer';
  }
}
