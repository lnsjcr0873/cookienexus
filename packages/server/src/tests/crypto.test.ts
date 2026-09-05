import { encryptWithPassword, decryptWithPassword, computeVaultAuthHash } from '../crypto/keyderivation.js';
import { AuditLogger } from '../rbac/audit_logger.js';

export function runCryptoTests(): boolean {
  console.log('[TEST] Starting Cryptographic & Security Tests...');
  let passed = true;

  const password = 'SuperSecretMasterPassword!2026';
  const rawPayload = JSON.stringify([{ domain: 'example.com', name: 'auth', value: 'secret_token_12345' }]);

  // 1. Encryption & Decryption roundtrip
  const encrypted = encryptWithPassword(rawPayload, password);
  const decrypted = decryptWithPassword(encrypted, password);

  if (decrypted !== rawPayload) {
    console.error('FAIL: Decrypted text does not match raw payload');
    passed = false;
  }

  // 2. Wrong password rejection
  try {
    decryptWithPassword(encrypted, 'WrongPassword');
    console.error('FAIL: Decryption with wrong password should fail');
    passed = false;
  } catch (e) {
    // Expected GCM tag verification error
  }

  // 3. Tamper detection (modify ciphertext by 1 byte)
  const tamperedCiphertext = Buffer.from(encrypted.ciphertext, 'base64');
  tamperedCiphertext[0] ^= 0xFF; // flip bits
  const tamperedPayload = { ...encrypted, ciphertext: tamperedCiphertext.toString('base64') };

  try {
    decryptWithPassword(tamperedPayload, password);
    console.error('FAIL: Tampered payload decryption should fail authentication tag check');
    passed = false;
  } catch (e) {
    // Expected authentication tag verification failure
  }

  // 4. Audit Log Masking
  const rawLog = 'User login with session_id=abcdef1234567890 and secret=top_secret_token';
  const sanitized = AuditLogger.sanitizeString(rawLog);
  if (sanitized.includes('abcdef1234567890') || sanitized.includes('top_secret_token')) {
    console.error('FAIL: Sanitized log still contains raw secrets');
    passed = false;
  }
  if (!sanitized.includes('abc****890') || !sanitized.includes('top****ken')) {
    console.error('FAIL: Sanitized log did not properly mask secrets:', sanitized);
    passed = false;
  }

  console.log(`[TEST] Crypto & Security Tests Finished. Result: ${passed ? 'PASSED' : 'FAILED'}`);
  return passed;
}
