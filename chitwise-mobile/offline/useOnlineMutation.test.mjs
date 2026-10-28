import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
const source=ts.transpileModule(await readFile(new URL('./useOnlineMutation.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
async function hook(online){
  const alerts=[];const context=vm.createContext({});const module=new vm.SourceTextModule(source,{context});
  const deps={'@tanstack/react-query':{useMutation:options=>options,onlineManager:{isOnline:()=>online}},'react-native':{Alert:{alert:(...args)=>alerts.push(args)}}};
  await module.link(async name=>{const values=deps[name];return new vm.SyntheticModule(Object.keys(values),function(){for(const[k,v]of Object.entries(values))this.setExport(k,v);},{context});});
  await module.evaluate();return{use:module.namespace.useOnlineMutation,alerts};
}
test('an inline offline error reaches the form handler without presenting a native alert or sending a request',async()=>{
  const h=await hook(false);let sent=0,handled;const context={chitId:'original-chit',sequence:3};
  const mutation=h.use({offlineErrorMode:'handler',mutationFn:async()=>{sent++;},onError:(...args)=>{handled=args;}});
  try{await mutation.mutationFn('draw');assert.fail('offline command was sent');}catch(e){mutation.onError(e,'draw',context,{});}
  assert.equal(sent,0);assert.equal(h.alerts.length,0);assert.match(handled[0].message,/No internet connection/);assert.equal(handled[2],context);
  assert.equal(mutation.offlineErrorMode,undefined);
});
test('other online-only forms retain their existing offline notice',async()=>{
  const h=await hook(false);let handled=0;const mutation=h.use({mutationFn:async()=>{},onError:()=>{handled++;}});
  try{await mutation.mutationFn();}catch(e){mutation.onError(e);}
  assert.equal(h.alerts.length,1);assert.equal(handled,0);
});
test('server failures reach the same dialog context with no additional native alert',async()=>{
  const h=await hook(true);const error=new Error('Draw changed');let result;const context={chitId:'original-chit',sequence:1};
  const mutation=h.use({offlineErrorMode:'handler',mutationFn:async()=>{throw error;},onError:(...args)=>{result=args;}});
  try{await mutation.mutationFn();}catch(e){mutation.onError(e,undefined,context,{});}
  assert.equal(result[0],error);assert.equal(result[2],context);assert.equal(h.alerts.length,0);
});
