import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {legacyStaffEvidence} from './legacyStaffEvidence.js';
const payload={requestId:'original',collectedAmount:100};
const row={operationId:'PARTIAL_COLLECT-original',action:'PARTIAL_COLLECT',createdAt:Date.parse('2026-01-01T12:00:00Z'),payload,payloadHash:createHash('sha256').update(JSON.stringify(payload)).digest('hex')};
test('older pickup wraps unchanged payload and stored hash with device time, without new authority',()=>{
 const result=legacyStaffEvidence(row);assert.equal(result.originalPayloadJson,JSON.stringify(payload));assert.equal(result.originalPayloadHash,row.payloadHash);assert.equal(result.recordedAt,'2026-01-01T12:00:00.000Z');assert.equal(result.operationId,row.operationId);assert.equal(result.offlineAuthorization,undefined);assert.equal(JSON.stringify(row.payload),JSON.stringify(payload));
 assert.equal(legacyStaffEvidence({...row,payload:{...payload,recordedAt:'2025-12-31T12:00:00Z'}}).recordedAt,'2025-12-31T12:00:00.000Z');
});
test('signed, unreadable and undated records cannot acquire retrospective authority',()=>{
 for(const change of [{action:'RECORD_PAYMENT'},{payload:{}},{payloadHash:'bad'},{payload:{...payload,offlineAuthorization:'signed'}},{createdAt:undefined},{createdAt:NaN}])assert.throws(()=>legacyStaffEvidence({...row,...change}),/remains preserved/);
});
