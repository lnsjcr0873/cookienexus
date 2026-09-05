import fs from 'node:fs';
import path from 'node:path';
import { FileStorageAdapter } from '../storage/file_store.js';
import { EncryptedVaultEnvelope } from '../storage/types.js';

export async function runPersistenceTests(): Promise<boolean> {
  console.log('[TEST] Starting File Persistence & Recovery Tests...');
  let passed = true;

  const testDir = path.resolve('./temp_test_data');
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }

  // 1. First instance writes vault
  const adapter1 = new FileStorageAdapter(testDir);
  const sampleVault: EncryptedVaultEnvelope = {
    vaultId: 'persisted_vault_alpha',
    deviceId: 'device_001',
    algorithm: 'AES-256-GCM',
    kdf: 'PBKDF2-SHA256',
    salt: 'salt123',
    iv: 'iv123',
    ciphertext: 'secret_ciphertext_here',
    tag: 'tag123',
    vectorClock: { device_001: 1 },
    updatedAt: Date.now(),
  };

  await adapter1.saveVault(sampleVault);

  // 2. Second instance starts up and reads from disk
  const adapter2 = new FileStorageAdapter(testDir);
  const recovered = await adapter2.getVault('persisted_vault_alpha');

  if (!recovered || recovered.ciphertext !== 'secret_ciphertext_here') {
    console.error('FAIL: Persisted vault recovery failed');
    passed = false;
  }

  // Cleanup
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }

  console.log(`[TEST] Persistence Tests Finished. Result: ${passed ? 'PASSED' : 'FAILED'}`);
  return passed;
}
