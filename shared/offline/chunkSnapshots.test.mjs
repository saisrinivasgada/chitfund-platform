import test from 'node:test';
import assert from 'node:assert/strict';
import { chunkSnapshot } from './chunkSnapshots.js';
import { listSnapshot, batchSnapshot } from './readSnapshots.js';

test('chunked reads preserve filtering, sorting and paging across large lists', async () => {
  const records = Array.from({ length: 12003 }, (_, i) => ({ id: `id-${i}`, fullName: `Member ${String(12003 - i).padStart(5, '0')}`, status: i % 2 ? 'ACTIVE' : 'INACTIVE' }));
  const pointer = { chunks: Math.ceil(records.length / 200) };
  for (const params of [{ page: 4, size: 33 }, { page: 2, size: 17, status: 'ACTIVE', search: 'Member', sort: 'fullName,asc' },
    { page: 0, size: 50, sort: 'fullName,desc' }, { page: 99999, size: 25 }, { search: '00001' }]) {
    let read = 0;
    const result = await chunkSnapshot('members', pointer, params, async (index) => { read++; return records.slice(index * 200, (index + 1) * 200); });
    assert.deepEqual(result, listSnapshot('members', records, params));
    assert.equal(read, pointer.chunks);
  }
});

test('new receipts overlay older complete history with no duplicate IDs and correct cross-page totals', async () => {
  const old = [{ id:'a',createdAt:'2026-10-10',memberId:'m',totalAmount:10 }, { id:'b',createdAt:'2026-10-09',memberId:'m',totalAmount:20 }];
  const updates = [{ id:'new',createdAt:'2026-10-11',memberId:'m',totalAmount:1000 }, { ...old[1],totalAmount:25 }];
  const overlay = { chunks:1,loadChunk:async()=>updates };
  const first = await chunkSnapshot('batches',{ chunks:2 },{ page:0,size:2 },async(i)=>[old[i]],overlay);
  assert.deepEqual(first.data.content.map((r)=>r.id),['new','a']); assert.equal(first.data.totalElements,3); assert.equal(first.data.hasMore,true);
  const second = await chunkSnapshot('batches',{ chunks:2 },{ page:1,size:2 },async(i)=>[old[i]],overlay);
  assert.deepEqual(second.data.content,[old[1]]); assert.equal(second.data.hasMore,false);
  const filtered = await chunkSnapshot('batches',{ chunks:2 },{ memberId:'other' },async(i)=>[old[i]],overlay);
  assert.deepEqual(filtered.data,[]);
});
test('batch chunk reads preserve receipt API contracts and unsupported parameters never fabricate data', async () => {
  const records = Array.from({ length: 701 }, (_, i) => ({ id: `receipt-${i}`, memberId: i % 2 ? 'a' : 'b', createdAt: '2026-10-15T12:00:00Z' }));
  const load = async (index) => records.slice(index * 200, (index + 1) * 200);
  for (const params of [{ page: 1, size: 25, memberId: 'a' }, { memberId: 'b', fromDate: '2026-10-15' }]) {
    assert.deepEqual(await chunkSnapshot('batches', { chunks: 4 }, params, load), batchSnapshot(records, params));
  }
  assert.equal(await chunkSnapshot('members', { chunks: 1 }, { tenantFilter: 'other' }, load), null);
  await assert.rejects(chunkSnapshot('members', { chunks: 1 }, {}, async () => { throw new Error('Missing encrypted page'); }), /Missing encrypted page/);
});

test('older chit transactions remain paged and isolated after an offline cold reopen', async () => {
  const records = Array.from({ length: 453 }, (_, i) => ({ id: `receipt-${i}`, chitId: i % 3 ? 'other-chit' : 'paid-chit', memberId: `member-${i % 11}`, createdAt: '2026-10-18T10:00:00Z' }));
  const pointer = { chunks: Math.ceil(records.length / 200) };
  const load = async index => structuredClone(records.slice(index * 200, (index + 1) * 200));
  const seen=[];
  for (let page=0;page<4;page++) {
    const result=await chunkSnapshot('batches',pointer,{chitId:'paid-chit',page,size:50},load);
    assert.equal(result.data.totalElements,151);
    assert.equal(result.data.hasMore,page<3);
    assert.ok(result.data.content.every(receipt=>receipt.chitId==='paid-chit'));
    seen.push(...result.data.content.map(receipt=>receipt.id));
  }
  assert.equal(seen.length,151);
  assert.equal(new Set(seen).size,151);
  assert.deepEqual(seen,records.filter(receipt=>receipt.chitId==='paid-chit').map(receipt=>receipt.id));
});
