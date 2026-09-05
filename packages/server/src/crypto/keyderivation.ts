import crypto from 'node:crypto';

export interface EncryptedPayload {
  salt: string; // Base64 (16 bytes)
  iv: string;   // Base64 (12 bytes)
  ciphertext: string; // Base64
  tag: string;  // Base64 (16 bytes)
}

/**
 * Derives a 256-bit AES key using PBKDF2 with SHA-256 (100,000 iterations).
 */
export function deriveKeyPBKDF2(password: string, salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
}

/**
 * Encrypts an arbitrary string using AES-256-GCM with a user master password.
 */
export function encryptWithPassword(plaintext: string, password: string): EncryptedPayload {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = deriveKeyPBKDF2(password, salt);

  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertextBuf = Buffer.concat([cipher.update(Buffer.from(plaintext, 'utf8')), cipher.final()]);
  const ciphertext = ciphertextBuf.toString('base64');
  const tag = cipher.getAuthTag();

  return {
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    ciphertext,
    tag: tag.toString('base64'),
  };
}

/**
 * Decrypts an AES-256-GCM encrypted payload using a user master password.
 */
export function decryptWithPassword(payload: EncryptedPayload, password: string): string {
  const salt = Buffer.from(payload.salt, 'base64');
  const iv = Buffer.from(payload.iv, 'base64');
  const tag = Buffer.from(payload.tag, 'base64');
  const key = deriveKeyPBKDF2(password, salt);

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  
  const ciphertextBuf = Buffer.from(payload.ciphertext, 'base64');
  const decryptedBuf = Buffer.concat([decipher.update(ciphertextBuf), decipher.final()]);
  return decryptedBuf.toString('utf8');
}

/**
 * Computes a blind verification hash: SHA-256(password + salt) for authenticating a vault without revealing key.
 */
export function computeVaultAuthHash(password: string, salt: string): string {
  return crypto.createHash('sha256').update(password + salt).digest('hex');
}
