import http from 'node:http';
import { ProbingEngine } from '../probing/prober.js';
import { MemoryStorageAdapter } from '../storage/memory_store.js';

export async function runProberTests(): Promise<boolean> {
  console.log('[TEST] Starting Probing Engine Mock Tests...');
  let passed = true;

  // Spin up a quick mock HTTP server
  let shouldFail = false;
  const mockServer = http.createServer((req, res) => {
    if (shouldFail) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'unauthorized', code: 401 }));
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', user: 'alice' }));
    }
  });

  await new Promise<void>((resolve) => mockServer.listen(9876, '127.0.0.1', resolve));

  const storage = new MemoryStorageAdapter();
  const prober = new ProbingEngine(storage);

  await prober.registerProbe({
    probeId: 'test_mock_probe',
    domain: 'mock.local',
    vaultId: 'v1',
    scheduleMs: 10000,
    request: {
      url: 'http://127.0.0.1:9876/status',
      method: 'GET',
    },
    assertion: {
      expectedStatus: 200,
      mustContain: ['"status":"ok"'],
    }
  });

  // 1. Initial healthy check
  const check1 = await prober.executeCheck('test_mock_probe');
  if (check1?.lastStatus !== 'HEALTHY') {
    console.error('FAIL: Expected probe to be HEALTHY, got', check1?.lastStatus);
    passed = false;
  }

  // 2. Simulate session expiration
  shouldFail = true;
  const check2 = await prober.executeCheck('test_mock_probe');
  if (check2?.lastStatus !== 'EXPIRED') {
    console.error('FAIL: Expected probe to transition to EXPIRED, got', check2?.lastStatus);
    passed = false;
  }

  prober.unregisterProbe('test_mock_probe');
  await new Promise<void>((resolve) => mockServer.close(() => resolve()));

  console.log(`[TEST] Prober Tests Finished. Result: ${passed ? 'PASSED' : 'FAILED'}`);
  return passed;
}
