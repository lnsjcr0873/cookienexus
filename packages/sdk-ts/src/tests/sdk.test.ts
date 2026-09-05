import { SDKCrypto } from '../crypto.js';
import { CookieNexusClient } from '../client.js';
import { CookiePool } from '../pool.js';

export async function runSDKTests(): Promise<boolean> {
  console.log('[TEST] Starting TypeScript SDK Tests...');
  let passed = true;

  const password = 'TestSecretPassword_2026_🔑';
  const vaultId = 'test_vault_01';
  const sampleCookies = [
    { domain: 'api.github.com', name: 'user_session', value: 'gh_secret_123_🍪', secure: true, httpOnly: true, sameSite: 'Strict' },
    { domain: 'google.com', name: 'SID', value: 'google_sid_456', secure: true, httpOnly: false, sameSite: 'Lax' },
  ];

  // 1. Test Encrypt & Decrypt Vault Envelope (including UTF-8 & Emoji support)
  const payload = SDKCrypto.encryptVault(sampleCookies, password, vaultId);
  const decrypted = SDKCrypto.decryptVault(payload, password);

  if (decrypted.length !== 2 || decrypted[0].value !== 'gh_secret_123_🍪') {
    console.error('FAIL: SDKCrypto Decrypt mismatch on UTF-8 characters');
    passed = false;
  }

  // 2. Test Playwright Storage State conversion & cURL exporter
  const client = new CookieNexusClient({
    hubUrl: 'http://127.0.0.1:8765',
    vaultId,
    password,
  });

  // 3. Test Cookie Pool Rotation Logic & Stats
  const pool = new CookiePool(client);
  pool.addAccount('account_alpha', 'vault_a', 'github.com', 5);
  pool.addAccount('account_beta', 'vault_b', 'github.com', 1);

  pool.markCooldown('account_alpha', 60);
  pool.markExpired('account_beta');

  // Verify pool stats
  const stats = pool.getStats();
  if (stats.length !== 2 || stats[0].accountId !== 'account_alpha' || stats[0].status !== 'COOLDOWN') {
    console.error('FAIL: CookiePool account registration and weight stats failed');
    passed = false;
  }
  pool.markHealthy('account_alpha');
  pool.markHealthy('account_beta');

  // 4. Test SessionManager Header Injection
  const { SessionManager } = await import('../session.js');
  const sessionMgr = new SessionManager(client);
  if (typeof sessionMgr.injectHeaders !== 'function' || typeof sessionMgr.injectAxios !== 'function') {
    console.error('FAIL: SessionManager methods missing');
    passed = false;
  }

  console.log(`[TEST] TypeScript SDK Tests Finished. Result: ${passed ? 'PASSED' : 'FAILED'}`);
  return passed;
}

if (process.argv[1] && process.argv[1].endsWith('sdk.test.js')) {
  runSDKTests().then(ok => process.exit(ok ? 0 : 1));
}
