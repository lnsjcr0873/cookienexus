import crypto from 'node:crypto';

export interface EncryptedVaultPayload {
  vaultId: string;
  deviceId: string;
  salt: string;
  iv: string;
  ciphertext: string;
  tag: string;
  algorithm?: string;
  kdf?: string;
  vectorClock?: Record<string, number>;
  updatedAt?: number;
}

export class SDKCrypto {
  static deriveKey(password: string, salt: Buffer): Buffer {
    return crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
  }

  static decryptVault(payload: EncryptedVaultPayload, password: string): any[] {
    const salt = Buffer.from(payload.salt, 'base64');
    const iv = Buffer.from(payload.iv, 'base64');
    const tag = Buffer.from(payload.tag, 'base64');
    const key = this.deriveKey(password, salt);

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(payload.ciphertext, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    return JSON.parse(decrypted);
  }

  static encryptVault(cookies: any[], password: string, vaultId: string, deviceId: string = 'ts_sdk'): EncryptedVaultPayload {
    const salt = crypto.randomBytes(16);
    const iv = crypto.randomBytes(12);
    const key = this.deriveKey(password, salt);

    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const jsonStr = JSON.stringify(cookies);
    let ciphertext = cipher.update(jsonStr, 'utf8', 'base64');
    ciphertext += cipher.final('base64');
    const tag = cipher.getAuthTag();

    return {
      vaultId,
      deviceId,
      algorithm: 'AES-256-GCM',
      kdf: 'PBKDF2-SHA256',
      salt: salt.toString('base64'),
      iv: iv.toString('base64'),
      ciphertext,
      tag: tag.toString('base64'),
      vectorClock: { [deviceId]: Date.now() },
      updatedAt: Date.now(),
    };
  }
}
