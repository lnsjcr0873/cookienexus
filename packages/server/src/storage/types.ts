export interface CookieRecord {
  domain: string;
  name: string;
  path: string;
  value: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite: 'Strict' | 'Lax' | 'None' | 'unspecified';
  hostOnly?: boolean;
  expirationDate?: number;
  session: boolean;
  updatedAt: number;
  nodeId: string;
  version: number;
  isDeleted?: boolean;
}

export interface CRDTCookieEntry {
  key: string;               // domain|name|path
  value: CookieRecord;       // Full cookie record
  timestamp: number;         // Physical timestamp (ms)
  nodeId: string;            // Mutating device UUID
  lamport: number;           // Monotonic counter
  tombstone: boolean;        // Soft delete marker
}

export interface EncryptedVaultEnvelope {
  vaultId: string;
  deviceId: string;
  algorithm: 'AES-256-GCM';
  kdf: 'PBKDF2-SHA256' | 'Argon2id';
  salt: string;
  iv: string;
  ciphertext: string;
  tag: string;
  vectorClock: Record<string, number>;
  updatedAt: number;
}

export interface ProbeDefinition {
  probeId: string;
  domain: string;
  vaultId: string;
  scheduleMs: number;
  request: {
    url: string;
    method: 'GET' | 'POST' | 'HEAD';
    headers?: Record<string, string>;
    timeoutMs?: number;
  };
  assertion: {
    expectedStatus?: number;
    mustContain?: string[];
    denyKeywords?: string[];
  };
  healing?: {
    action: 'webhook' | 'alert_only';
    webhookUrl?: string;
  };
  lastCheck?: number;
  lastStatus?: 'HEALTHY' | 'EXPIRED' | 'DEGRADED' | 'UNKNOWN';
  lastLatencyMs?: number;
  lastErrorMessage?: string;
}

export interface UserSession {
  userId: string;
  username: string;
  role: 'admin' | 'developer' | 'viewer';
  allowedDomains: string[]; // e.g. ["*"] or ["example.com", "*.internal.net"]
  token: string;
}
