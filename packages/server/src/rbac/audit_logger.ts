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
    // Mask potential tokens, passwords, cookies in log strings
    return input.replace(/(token|password|auth|secret|session_id)=([^\s&]+)/gi, (match, key, val) => {
      return `${key}=${AuditLogger.maskSecret(val)}`;
    });
  }

  public log(entry: Omit<AuditLogEntry, 'timestamp'>) {
    const sanitizedEntry: AuditLogEntry = {
      ...entry,
      details: AuditLogger.sanitizeString(entry.details),
      timestamp: new Date().toISOString(),
    };
    this.logs.push(sanitizedEntry);
    console.log(`[AUDIT] [${sanitizedEntry.timestamp}] [${sanitizedEntry.action}] [User:${sanitizedEntry.userId}] [${sanitizedEntry.status}]: ${sanitizedEntry.details}`);
  }

  public getRecentLogs(limit: number = 50): AuditLogEntry[] {
    return this.logs.slice(-limit);
  }
}
