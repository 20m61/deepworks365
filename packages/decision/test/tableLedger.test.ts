import { createTableLedger } from '../src/ledger/tableLedger.js';
import { createFakeTableClient } from './support/fakeTableClient.js';
import { runLedgerContract, counter } from './support/ledgerContract.js';

runLedgerContract('tableLedger', () => createTableLedger(createFakeTableClient(), counter()));
