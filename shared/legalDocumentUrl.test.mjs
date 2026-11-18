import test from 'node:test';
import assert from 'node:assert/strict';
import { legalDocumentUrl } from './legalDocumentUrl.js';

const options = { baseUrl: 'https://thechitwise.com', allowedOrigins: ['https://thechitwise.com'] };

test('legal review opens only the requested immutable version', () => {
  assert.equal(legalDocumentUrl({ version: '2.0', documentUrl: '/api/legal/documents/terms/2.0' }, 'terms', options),
    'https://thechitwise.com/api/legal/documents/terms/2.0');
  assert.equal(legalDocumentUrl({ version: '2.0', documentUrl: '/api/legal/documents/terms/1.0' }, 'terms', options), null);
  assert.equal(legalDocumentUrl({ version: '2.0', documentUrl: '/api/legal/documents/privacy/2.0' }, 'terms', options), null);
  assert.equal(legalDocumentUrl({ version: '2.0', documentUrl: '/terms' }, 'terms', options), null);
  assert.equal(legalDocumentUrl({ version: '2.0', documentUrl: 'https://attacker.example/api/legal/documents/terms/2.0' }, 'terms', options), null);
  assert.equal(legalDocumentUrl({ version: '2.0', documentUrl: '/api/legal/documents/terms/2.0?token=leak' }, 'terms', options), null);
});
