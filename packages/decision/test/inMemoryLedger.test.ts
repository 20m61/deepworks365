import { createInMemoryLedger } from '../src/ledger/inMemoryLedger.js';
import { runLedgerContract, counter } from './support/ledgerContract.js';

runLedgerContract('inMemoryLedger', () => createInMemoryLedger(counter()));
