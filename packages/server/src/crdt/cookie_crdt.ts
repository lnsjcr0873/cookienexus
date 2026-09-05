import { CookieRecord, CRDTCookieEntry } from '../storage/types.js';

/**
 * CookieCRDT: Conflict-Free Replicated Data Type for Cookie sets.
 * Uses Last-Write-Wins Element-Set (LWW-Element-Set) semantics keyed by domain|name|path.
 */
export class CookieCRDT {
  private state: Map<string, CRDTCookieEntry> = new Map();
  private vectorClock: Record<string, number> = {};
  private currentLamport: number = 0;

  constructor(public readonly nodeId: string) {
    this.vectorClock[nodeId] = 0;
    this.currentLamport = 0;
  }

  public static generateKey(domain: string, name: string, path: string = '/'): string {
    const cleanDomain = (domain || 'localhost').toLowerCase().trim().replace(/^\./, '');
    return `${cleanDomain}|${(name || '').trim()}|${(path || '/').trim()}`;
  }

  public getVectorClock(): Record<string, number> {
    return { ...this.vectorClock };
  }

  public set(cookie: CookieRecord): CRDTCookieEntry {
    const key = CookieCRDT.generateKey(cookie.domain, cookie.name, cookie.path);
    this.currentLamport++;
    this.vectorClock[this.nodeId] = this.currentLamport;
    const lamport = this.currentLamport;
    const now = Date.now();

    const entry: CRDTCookieEntry = {
      key,
      value: { ...cookie, updatedAt: now, nodeId: this.nodeId, version: lamport, isDeleted: false },
      timestamp: now,
      nodeId: this.nodeId,
      lamport,
      tombstone: false,
    };

    this.state.set(key, entry);
    return entry;
  }

  public delete(domain: string, name: string, path: string = '/'): CRDTCookieEntry | null {
    const key = CookieCRDT.generateKey(domain, name, path);
    const existing = this.state.get(key);
    
    this.currentLamport++;
    this.vectorClock[this.nodeId] = this.currentLamport;
    const lamport = this.currentLamport;
    const now = Date.now();

    const dummyCookie: CookieRecord = existing ? { ...existing.value, isDeleted: true } : {
      domain,
      name,
      path,
      value: '',
      secure: true,
      httpOnly: false,
      sameSite: 'Lax',
      session: true,
      updatedAt: now,
      nodeId: this.nodeId,
      version: lamport,
      isDeleted: true
    };

    const entry: CRDTCookieEntry = {
      key,
      value: dummyCookie,
      timestamp: now,
      nodeId: this.nodeId,
      lamport,
      tombstone: true,
    };

    this.state.set(key, entry);
    return entry;
  }

  public mergeEntry(incoming: CRDTCookieEntry): boolean {
    const existing = this.state.get(incoming.key);
    if (!existing) {
      this.state.set(incoming.key, incoming);
      this.updateVectorClock(incoming.nodeId, incoming.lamport);
      return true;
    }

    // 1. Compare Lamport clock
    if (incoming.lamport > existing.lamport) {
      this.state.set(incoming.key, incoming);
      this.updateVectorClock(incoming.nodeId, incoming.lamport);
      return true;
    } else if (incoming.lamport < existing.lamport) {
      return false;
    }

    // 2. Tie-breaker: Physical timestamp
    if (incoming.timestamp > existing.timestamp) {
      this.state.set(incoming.key, incoming);
      this.updateVectorClock(incoming.nodeId, incoming.lamport);
      return true;
    } else if (incoming.timestamp < existing.timestamp) {
      return false;
    }

    // 3. Deterministic Node ID tie-breaker (lexicographical)
    if (incoming.nodeId > existing.nodeId) {
      this.state.set(incoming.key, incoming);
      this.updateVectorClock(incoming.nodeId, incoming.lamport);
      return true;
    }

    return false;
  }

  public mergeBatch(entries: CRDTCookieEntry[], remoteVectorClock?: Record<string, number>): number {
    let mergedCount = 0;
    for (const entry of entries) {
      if (this.mergeEntry(entry)) {
        mergedCount++;
      }
    }
    if (remoteVectorClock) {
      for (const [node, clock] of Object.entries(remoteVectorClock)) {
        this.updateVectorClock(node, clock);
      }
    }
    return mergedCount;
  }

  private updateVectorClock(nodeId: string, clock: number) {
    this.vectorClock[nodeId] = Math.max(this.vectorClock[nodeId] || 0, clock);
    this.currentLamport = Math.max(this.currentLamport, clock);
  }

  public getActiveCookies(): CookieRecord[] {
    const cookies: CookieRecord[] = [];
    for (const entry of this.state.values()) {
      if (!entry.tombstone && !entry.value.isDeleted) {
        cookies.push(entry.value);
      }
    }
    return cookies;
  }

  public getAllEntries(): CRDTCookieEntry[] {
    return Array.from(this.state.values());
  }

  public pruneTombstones(ttlMs: number = 30 * 24 * 3600 * 1000): number {
    const now = Date.now();
    let pruned = 0;
    for (const [key, entry] of this.state.entries()) {
      if (entry.tombstone && (now - entry.timestamp > ttlMs)) {
        this.state.delete(key);
        pruned++;
      }
    }
    return pruned;
  }
}
