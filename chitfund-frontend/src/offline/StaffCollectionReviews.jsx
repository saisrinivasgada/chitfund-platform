import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { activeAccountScope, requestForAccount } from './accountClient';
import Modal from '../components/ui/Modal';
import Button from '../components/ui/Button';
import { formatRefundTime, parseRefundTime } from '../../../shared/offline/refundDate';

const base = '/payments/offline/staff-actions/reviews';
const choices = [
  ['RECORD_CUSTODY', 'Record the original pickup. The original collector must be assigned; member approval and remittance still follow.'],
  ['LINK_CUSTODY', 'I verified this is the same physical collection already recorded on this pickup. Link it without another collection.'],
  ['CANCEL_MISTAKE', 'Cancel mistaken entry — no money was collected.'],
  ['RECORD_REFUND', 'The full held collection has already been returned. Record the completed refund.'],
];
const money = (v) => v == null ? 'Amount needs verification' : `₹${Number(v).toLocaleString('en-IN')}`;
export default function StaffCollectionReviews({ scope, onClose, onBack }) {
  const qc = useQueryClient();
  const [page,setPage]=useState(0), [listing,setListing]=useState(null), [detail,setDetail]=useState(null);
  const [busy,setBusy]=useState(false), [error,setError]=useState(''), [decision,setDecision]=useState('');
  const [amount,setAmount]=useState(''), [reason,setReason]=useState(''), [confirmed,setConfirmed]=useState(false);
  const [method,setMethod]=useState('CASH'), [reference,setReference]=useState(''), [returnedAt,setReturnedAt]=useState(formatRefundTime);
  const mounted=useRef(true), sequence=useRef(0);
  const current=()=>mounted.current && activeAccountScope()===scope;
  const call=(url,body)=>requestForAccount(scope,base+url,body?{method:'POST',body}:undefined);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;sequence.current++;};},[scope]);
  useEffect(()=>{let live=true;call(`?page=${page}&size=20`).then(v=>{if(live&&current())setListing(v);}).catch(e=>{if(live&&current())setError(e.message);});return()=>{live=false;};},[scope,page]);
  async function inspect(id){
    const request=++sequence.current;setBusy(true);setError('');setDetail(null);setDecision('');setReason('');setConfirmed(false);setReference('');
    try{const v=await call(`/${id}`);if(current()&&request===sequence.current){setDetail(v);setAmount(v.amount==null?'':String(v.amount));setReturnedAt(formatRefundTime());setMethod('CASH');}}
    catch(e){if(current()&&request===sequence.current)setError(e.message);}finally{if(current()&&request===sequence.current)setBusy(false);}
  }
  async function resolve(){
    setBusy(true);setError('');
    try{
      await call(`/${detail.id}/resolve`,{decision,reason:reason.trim(),expectedVersion:detail.version,confirmed,
        actualAmount:decision==='CANCEL_MISTAKE'?undefined:Number(amount),paymentMode:decision==='RECORD_REFUND'?method:undefined,
        reference:decision==='RECORD_REFUND'?reference.trim():undefined,refundedAt:decision==='RECORD_REFUND'?parseRefundTime(returnedAt):undefined});
      if(current()){
        // The recorded decision must not wait for unrelated, slow dashboard reads.
        setDetail(null);
        setListing(prior=>prior?{...prior,content:prior.content.filter(e=>e.id!==detail.id),totalElements:Math.max(0,prior.totalElements-1)}:prior);
        void qc.invalidateQueries({refetchType:'active'}).catch(()=>{});
        const next=await call(`?page=${page}&size=20`);
        if(current()){setDetail(null);if(page>0&&!next.content.length){setListing(null);setPage(page-1);}else setListing(next);}
      }
    }catch(e){if(current()){setError(e.message);setConfirmed(false);}}finally{if(current())setBusy(false);}
  }
  const input='w-full rounded-xl border border-gray-300 p-3 text-sm';
  return <Modal title="Staff pickup reviews" onClose={onClose} size="2xl">
    <p className="text-sm text-gray-500 mb-4">These records preserve who holds the cash. Member dues change only after normal collection approval and remittance.</p>
    {error&&(!detail||!decision)&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800 mb-3">{error}</p>}
    {!detail?<>
      {!listing?<p>Loading pickup reviews…</p>:!listing.content.length?<p className="text-emerald-800">No staff pickups waiting for review.</p>
        :<div className="space-y-2">{listing.content.map(e=><button key={e.id} disabled={busy} onClick={()=>inspect(e.id)} className="w-full text-left rounded-xl bg-amber-50 border border-amber-200 p-4">
          <p className="font-semibold">{money(e.amount)} · {e.originalRole==='MANAGER'?'Manager':'Staff'} pickup</p>
          <p className="text-xs text-gray-500 mt-1">Task or account access changed · {new Date(e.recordedAt).toLocaleString()}</p></button>)}</div>}
      <div className="flex justify-between my-4"><Button variant="ghost" disabled={!page||busy} onClick={()=>{setListing(null);setPage(page-1);}}>Previous pickups</Button>
        <Button variant="ghost" disabled={!listing||listing.last||busy} onClick={()=>{setListing(null);setPage(page+1);}}>Next pickups</Button></div>
    </>:<div className="space-y-4">
      <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 space-y-2">
        <p className="text-lg font-semibold">{money(detail.amount)}</p><p className="text-sm">Original collector: {detail.collectorName || 'Name unavailable'}</p>
        <p className="text-xs text-gray-500 break-all">Pickup: {detail.requestId}</p><p className="text-sm">Current task: {detail.current?.status?.replaceAll('_',' ')??'Unavailable'}{detail.current?` · ${detail.current.assignedToOriginalCollector?'Assigned to original collector':'Assignment changed'}`:''}</p>
        <p className="text-xs text-gray-500">Recorded {new Date(detail.recordedAt).toLocaleString()}</p>
      </div>
      {detail.status!=='PENDING'?<p className="text-emerald-800">Decision recorded: {detail.status} · {detail.resolutionReason}</p>:<>
        {choices.map(([value,label])=><label key={value} className="flex gap-3 rounded-xl border border-gray-200 p-3 text-sm"><input type="radio" name="staff-review-decision" value={value} checked={decision===value} disabled={busy} onChange={()=>{setDecision(value);setConfirmed(false);}}/>{label}</label>)}
        {decision&&<>
          {decision!=='CANCEL_MISTAKE'&&<label className="block text-sm">Actual original collected amount<input aria-label="Actual original collected amount" type="number" min="0.01" step="0.01" className={input} value={amount} disabled={detail.amount!=null||busy} onChange={e=>setAmount(e.target.value)}/></label>}
          {decision==='RECORD_REFUND'&&<>
            <label className="block text-sm">Refund method<select aria-label="Pickup refund method" value={method} onChange={e=>setMethod(e.target.value)} className={input}>{['CASH','UPI','BANK_TRANSFER','CHEQUE'].map(m=><option key={m}>{m}</option>)}</select></label>
            <input aria-label="Pickup refund reference" placeholder="Completed refund reference" value={reference} maxLength={200} onChange={e=>setReference(e.target.value)} className={input}/>
            <label className="block text-sm">Returned on · DD/MM/YYYY HH:MM<input aria-label="Pickup refund date" value={returnedAt} onChange={e=>setReturnedAt(e.target.value)} className={input}/></label>
          </>}
          <textarea aria-label="Pickup review reason" placeholder="Explain the verified outcome" value={reason} maxLength={500} onChange={e=>setReason(e.target.value)} className={input}/>
          <label className="flex gap-3 text-sm"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>{decision==='CANCEL_MISTAKE'?'No money was collected for this entry.':decision==='RECORD_REFUND'?'The full original collection has already been returned.':'I verified the original collector, amount and this physical collection.'}</label>
          {error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
          <Button loading={busy} disabled={!confirmed||reason.trim().length<5||(decision!=='CANCEL_MISTAKE'&&(!Number.isFinite(Number(amount))||Number(amount)<=0))||(decision==='RECORD_REFUND'&&reference.trim().length<3)} onClick={resolve}>Confirm pickup decision</Button>
        </>}
      </>}
      <div className="flex gap-2"><Button variant="ghost" disabled={busy} onClick={()=>inspect(detail.id)}>Refresh pickup details</Button><Button variant="ghost" disabled={busy} onClick={()=>{sequence.current++;setDetail(null);setError('');}}>Back to pickup reviews</Button></div>
    </div>}
    <div className="flex justify-between mt-5"><Button variant="ghost" disabled={busy} onClick={onBack}>Payment reviews</Button><Button variant="ghost" disabled={busy} onClick={onClose}>Close</Button></div>
  </Modal>;
}
