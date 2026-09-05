import { runCRDTTests } from './crdt.test.js';
import { runCryptoTests } from './crypto.test.js';
import { runProberTests } from './prober.test.js';
import { runPersistenceTests } from './persistence.test.js';

async function main() {
  console.log('====================================================');
  console.log('   CookieNexus Server Hub Test Suite Execution     ');
  console.log('====================================================\n');

  const crdtOk = runCRDTTests();
  const cryptoOk = runCryptoTests();
  const proberOk = await runProberTests();
  const persistOk = await runPersistenceTests();

  console.log('\n----------------------------------------------------');
  if (crdtOk && cryptoOk && proberOk && persistOk) {
    console.log(' ALL SERVER TESTS PASSED SUCCESSFULLY! (4/4)');
    console.log('----------------------------------------------------\n');
    process.exit(0);
  } else {
    console.error(' SOME TESTS FAILED.');
    console.log('----------------------------------------------------\n');
    process.exit(1);
  }
}

main();
