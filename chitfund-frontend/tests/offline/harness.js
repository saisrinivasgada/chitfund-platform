// Included only by the isolated offline browser test build, never normal releases.
import { rememberAccount, refreshOfflineAccess } from '../../src/offline/accountClient';
import { saveCachedResponse } from '../../src/offline/cache';
import { queuePayment } from '../../src/offline/outbox';
import { readRows, mutateRow } from '../../src/offline/storage';
globalThis.chitwiseOfflineHarness = { rememberAccount, refreshOfflineAccess, saveCachedResponse, queuePayment, readRows, mutateRow };
