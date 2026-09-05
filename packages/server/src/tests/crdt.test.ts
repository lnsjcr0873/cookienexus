import { CookieCRDT } from '../crdt/cookie_crdt.js';
import { CookieRecord } from '../storage/types.js';

export function runCRDTTests(): boolean {
  console.log('[TEST] Starting CRDT LWW-Element-Set Tests...');
  let passed = true;

  const nodeA = new CookieCRDT('node_A');
  const nodeB = new CookieCRDT('node_B');

  const cookie1: CookieRecord = {
    domain: 'github.com',
    name: 'user_session',
    path: '/',
    value: 'token_alpha_1',
    secure: true,
    httpOnly: true,
    sameSite: 'Lax',
    session: false,
    updatedAt: Date.now(),
    nodeId: 'node_A',
    version: 1,
  };

  // 1. Node A sets cookie
  const entryA = nodeA.set(cookie1);
  if (nodeA.getActiveCookies().length !== 1) {
    console.error('FAIL: nodeA should have 1 active cookie');
    passed = false;
  }

  // 2. Node B merges from Node A
  nodeB.mergeEntry(entryA);
  if (nodeB.getActiveCookies().length !== 1 || nodeB.getActiveCookies()[0].value !== 'token_alpha_1') {
    console.error('FAIL: nodeB merge failed');
    passed = false;
  }

  // 3. Concurrent update: Node B updates with higher timestamp
  const cookie1Updated: CookieRecord = {
    ...cookie1,
    value: 'token_beta_2',
  };
  const entryB = nodeB.set(cookie1Updated);

  // Node A merges entryB
  nodeA.mergeEntry(entryB);
  if (nodeA.getActiveCookies()[0].value !== 'token_beta_2') {
    console.error('FAIL: Node A should converge to token_beta_2');
    passed = false;
  }

  // 4. Deletion tombstone test
  const deleteEntry = nodeA.delete('github.com', 'user_session', '/');
  if (nodeA.getActiveCookies().length !== 0) {
    console.error('FAIL: Node A should have 0 active cookies after delete');
    passed = false;
  }

  // Node B merges deletion
  if (deleteEntry) {
    nodeB.mergeEntry(deleteEntry);
  }
  if (nodeB.getActiveCookies().length !== 0) {
    console.error('FAIL: Node B should have 0 active cookies after merging delete tombstone');
    passed = false;
  }

  console.log(`[TEST] CRDT Tests Finished. Result: ${passed ? 'PASSED' : 'FAILED'}`);
  return passed;
}
