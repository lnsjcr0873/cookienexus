export interface AuditLogEntry {
  timestamp: string;
  action: string;
  userId: string;
  vaultId?: string;
  ip: string;
  status: 'SUCCESS' | 'DENIED' | 'ERROR';
  details: string;
}

export class AuditLogger {
  private logs: AuditLogEntry[] = [];

  public static maskSecret(secret: string): string {
    if (!secret || secret.length < 8) return '****';
    const prefix = secret.slice(0, 3);
    const suffix = secret.slice(-3);
    return `${prefix}****${suffix}`;
  }

  public static sanitizeString(input: string): string {
    if (!input) return '';
    return input
      .replace(/("?(?:token|password|auth|secret|session_id|user_session|key|cookie)"?\s*[:=]\s*["']?)([^"',\s&}]+)(["']?)/gi, (match, prefix, val, suffix) => {
        return `${prefix}${AuditLogger.maskSecret(val)}${suffix}`;
      })
      .replace(/(Bearer\s+)([A-Za-z0-9_\-\.]+)/gi, (match, prefix, val) => {
        return `${prefix}${AuditLogger.maskSecret(val)}`;
      });
  }

  public log(entry: Omit<AuditLogEntry, 'timestamp'>) {
    const sanitizedEntry: AuditLogEntry = {
      ...entry,
      details: AuditLogger.sanitizeString(entry.details),
      timestamp: new Date().toISOString(),
    };
    this.logs.push(sanitizedEntry);
    if (this.logs.length > 5000) {
      this.logs.splice(0, this.logs.length - 5000);
    }
    console.log(`[AUDIT] [${sanitizedEntry.timestamp}] [${sanitizedEntry.action}] [User:${sanitizedEntry.userId}] [${sanitizedEntry.status}]: ${sanitizedEntry.details}`);
  }

  public getRecentLogs(limit: number = 50): AuditLogEntry[] {
    return this.logs.slice(-limit);
  }
}
