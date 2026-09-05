import { SDKCrypto } from '../crypto.js';
import { CookieNexusClient } from '../client.js';
import { CookiePool } from '../pool.js';

export function runSDKTests(): boolean {
  console.log('[TEST] Starting TypeScript SDK Tests...');
  let passed = true;

  const password = 'TestSecretPassword_2026';
  const vaultId = 'test_vault_01';
  const sampleCookies = [
    { domain: 'api.github.com', name: 'user_session', value: 'gh_secret_123', secure: true, httpOnly: true },
    { domain: 'google.com', name: 'SID', value: 'google_sid_456', secure: true, httpOnly: false },
  ];

  // 1. Test Encrypt & Decrypt Vault Envelope
  const payload = SDKCrypto.encryptVault(sampleCookies, password, vaultId);
  const decrypted = SDKCrypto.decryptVault(payload, password);

  if (decrypted.length !== 2 || decrypted[0].name !== 'user_session') {
    console.error('FAIL: SDKCrypto Decrypt mismatch');
    passed = false;
  }

  // 2. Test Playwright Storage State conversion
  const client = new CookieNexusClient({
    hubUrl: 'http://127.0.0.1:8765',
    vaultId,
    password,
  });

  // 3. Test Cookie Pool Rotation Logic
  const pool = new CookiePool(client);
  pool.addAccount('account_alpha', 'vault_a', 'github.com');
  pool.addAccount('account_beta', 'vault_b', 'github.com');

  // Verify pool stats
  const stats = pool.getStats();
  if (stats.length !== 2 || stats[0].accountId !== 'account_alpha') {
    console.error('FAIL: CookiePool account registration failed');
    passed = false;
  }

  console.log(`[TEST] TypeScript SDK Tests Finished. Result: ${passed ? 'PASSED' : 'FAILED'}`);
  return passed;
}

if (process.argv[1] && process.argv[1].endsWith('sdk.test.js')) {
  const ok = runSDKTests();
  process.exit(ok ? 0 : 1);
}
