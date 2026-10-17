import { test, expect } from '@playwright/test';
import { installAuthenticatedApp, expectAuthenticatedShell } from './fixtures';
test.use({serviceWorkers:'block'});
async function app(page,{stale=false,unknown=false,legacy=false,holdRefresh}={}){
  let pending=true,version='task-v1';const decisions=[];
  const entry={authorizationVerified:!legacy,id:'staff-review',kind:'STAFF_PICKUP',status:'PENDING',amount:unknown?null:100,requestId:'original-request',recordedBy:'original-staff',originalRole:'STAFF',recordedAt:'2026-10-15T12:00:00Z'};
  await installAuthenticatedApp(page,{resolveApi:async({url,request,json})=>{
    if(url.pathname==='/api/payments/offline/reviews')return json({success:true,data:{content:[],totalElements:0,last:true}});
    if(url.pathname==='/api/payments/offline/staff-actions/reviews'){
      if(!pending&&holdRefresh&&url.searchParams.get('size')==='1')await holdRefresh;
      return json({success:true,data:{content:pending?[entry]:[],totalElements:pending?1:0,last:true}});
    }
    if(url.pathname==='/api/payments/offline/staff-actions/reviews/staff-review')return json({success:true,data:{...entry,collectorName:'QA Collector A',version,current:{status:'ASSIGNED',assignedToOriginalCollector:true}}});
    if(url.pathname==='/api/payments/offline/staff-actions/reviews/staff-review/resolve'){
      decisions.push(request.postDataJSON());
      if(stale&&decisions.length===1){version='task-v2';return{...json({success:false,message:'Pickup changed during review. Refresh and review the latest details.'}),status:409};}
      pending=false;return json({success:true,data:{...entry,status:'RECORDED'}});
    }
    return null;
  }});
  await page.goto('/dashboard');await expectAuthenticatedShell(page);
  await page.getByRole('button',{name:/Collection reviews \(1\)/}).click();
  await page.getByRole('button',{name:'Staff pickup reviews (1)'}).click();
  await page.getByRole('button',{name:unknown?/Amount needs verification · Staff pickup/:/₹100 · Staff pickup/}).click();
  await expect(page.getByText(/Member dues change only after normal collection approval and remittance/)).toBeVisible();
  await expect(page.getByText('Original collector: QA Collector A')).toBeVisible();return decisions;
}
test('staff recovery requires original amount, reason and a deliberate custody confirmation',async({page},info)=>{
  const decisions=await app(page);await page.getByRole('radio',{name:/Record the original pickup/}).check();
  const submit=page.getByRole('button',{name:'Confirm pickup decision'});await expect(submit).toBeDisabled();
  await expect(page.getByLabel('Actual original collected amount')).toBeDisabled();await expect(page.getByLabel('Actual original collected amount')).toHaveValue('100');
  await page.getByLabel('Pickup review reason').fill('Verified original cash with collector and member');await expect(submit).toBeDisabled();
  await page.getByRole('checkbox',{name:/I verified the original collector/}).check();
  await page.setViewportSize({width:390,height:844});await submit.scrollIntoViewIfNeeded();await expect(submit).toBeInViewport();
  await page.screenshot({path:info.outputPath('staff-custody-review-mobile.png')});await submit.click();
  await expect(page.getByText('No staff pickups waiting for review.')).toBeVisible();
  expect(decisions).toEqual([{decision:'RECORD_CUSTODY',reason:'Verified original cash with collector and member',expectedVersion:'task-v1',confirmed:true,actualAmount:100}]);
});
test('a changed pickup requires refreshing its version and confirming again',async({page})=>{
  const decisions=await app(page,{stale:true});await page.getByRole('radio',{name:/same physical collection already recorded/}).check();
  await page.getByLabel('Pickup review reason').fill('Verified same physical collection');await page.getByRole('checkbox',{name:/I verified the original collector/}).check();
  await page.getByRole('button',{name:'Confirm pickup decision'}).click();await expect(page.getByRole('alert')).toContainText('changed during review');
  await expect(page.getByRole('button',{name:'Confirm pickup decision'})).toBeDisabled();await page.getByRole('button',{name:'Refresh pickup details'}).click();
  await page.getByRole('radio',{name:/same physical collection already recorded/}).check();await page.getByLabel('Pickup review reason').fill('Verified again after refreshing task');
  await page.getByRole('checkbox',{name:/I verified the original collector/}).check();await page.getByRole('button',{name:'Confirm pickup decision'}).click();
  await expect(page.getByText('No staff pickups waiting for review.')).toBeVisible();expect(decisions[1]).toMatchObject({decision:'LINK_CUSTODY',expectedVersion:'task-v2',actualAmount:100});
});
test('an older unknown amount must be entered explicitly before recording a completed refund',async({page})=>{
  const decisions=await app(page,{unknown:true});await page.getByRole('radio',{name:/full held collection has already been returned/}).check();
  const submit=page.getByRole('button',{name:'Confirm pickup decision'});await page.getByLabel('Pickup review reason').fill('Returned original held cash with witness');
  await page.getByLabel('Pickup refund reference').fill('RETURN-123');await page.getByRole('checkbox',{name:/full original collection has already been returned/}).check();await expect(submit).toBeDisabled();
  await page.getByLabel('Actual original collected amount').fill('150');await submit.click();await expect(page.getByText('No staff pickups waiting for review.')).toBeVisible();
  expect(decisions[0]).toMatchObject({decision:'RECORD_REFUND',actualAmount:150,confirmed:true,paymentMode:'CASH',reference:'RETURN-123'});expect(Number.isNaN(Date.parse(decisions[0].refundedAt))).toBe(false);
});
test('cancelling a staff mistake requires confirmation that no cash was collected',async({page})=>{
  const decisions=await app(page);await page.getByRole('radio',{name:/Cancel mistaken entry/}).check();await page.getByLabel('Pickup review reason').fill('Wrong pickup selected, no money collected');
  const submit=page.getByRole('button',{name:'Confirm pickup decision'});await expect(submit).toBeDisabled();await page.getByRole('checkbox',{name:'No money was collected for this entry.'}).check();
  await submit.click();await expect(page.getByText('No staff pickups waiting for review.')).toBeVisible();expect(decisions[0]).toMatchObject({decision:'CANCEL_MISTAKE',confirmed:true});expect(decisions[0].actualAmount).toBeUndefined();
});
test('a confirmed review does not wait for a stalled background count refresh',async({page})=>{
  let release;const holdRefresh=new Promise(resolve=>{release=resolve;});
  try{
    const decisions=await app(page,{holdRefresh});
    await page.getByRole('radio',{name:/Cancel mistaken entry/}).check();
    await page.getByLabel('Pickup review reason').fill('Verified mistake, no money collected');
    await page.getByRole('checkbox',{name:'No money was collected for this entry.'}).check();
    await page.getByRole('button',{name:'Confirm pickup decision'}).click();
    await expect(page.getByText('No staff pickups waiting for review.')).toBeVisible();
    expect(decisions).toHaveLength(1);
  }finally{release();}
});

test('unsigned older cash requires separate evidence verification and actual original time',async({page})=>{
 const decisions=await app(page,{legacy:true,unknown:true});await expect(page.getByText(/no signed offline authorisation/)).toBeVisible();
 await page.getByRole('radio',{name:/Record the original pickup/}).check();
 await page.getByLabel('Actual original collected amount').fill('150');await page.getByLabel('Pickup review reason').fill('Verified original collector and collection evidence');
 await page.getByRole('checkbox',{name:/I verified the original collector/}).check();
 const submit=page.getByRole('button',{name:'Confirm pickup decision'});await expect(submit).toBeDisabled();
 await page.getByRole('checkbox',{name:/I checked this older record/}).check();await expect(submit).toBeDisabled();
 await page.getByLabel('Verified original collection time').fill('bad date');await submit.click();await expect(page.getByRole('alert')).toContainText('actual original collection date');expect(decisions).toHaveLength(0);
 await page.getByLabel('Verified original collection time').fill('15/10/2026 10:30');await page.getByRole('checkbox',{name:/I verified the original collector/}).check();await submit.click();
 await expect(page.getByText('No staff pickups waiting for review.')).toBeVisible();expect(decisions[0]).toMatchObject({legacyDetailsVerified:true,actualAmount:150});expect(Number.isNaN(Date.parse(decisions[0].verifiedRecordedAt))).toBe(false);
});
test('unsigned mistake cancellation requires evidence but does not invent a collection time',async({page})=>{
 const decisions=await app(page,{legacy:true});await page.getByRole('radio',{name:/Cancel mistaken entry/}).check();await page.getByLabel('Pickup review reason').fill('Verified mistake, no money collected');await page.getByRole('checkbox',{name:'No money was collected for this entry.'}).check();
 const submit=page.getByRole('button',{name:'Confirm pickup decision'});await expect(submit).toBeDisabled();await expect(page.getByLabel('Verified original collection time')).toHaveCount(0);
 await page.getByRole('checkbox',{name:/I checked this older record/}).check();await submit.click();await expect(page.getByText('No staff pickups waiting for review.')).toBeVisible();expect(decisions[0]).toMatchObject({legacyDetailsVerified:true,decision:'CANCEL_MISTAKE'});expect(decisions[0].verifiedRecordedAt).toBeUndefined();
});
