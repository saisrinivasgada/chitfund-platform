import { test, expect } from '@playwright/test';
import { installAuthenticatedApp, expectAuthenticatedShell } from './fixtures';

test.use({ serviceWorkers: 'block' });

async function app(page) {
  await installAuthenticatedApp(page, { offlineEnabled: true });
  await page.goto('/dashboard'); await expectAuthenticatedShell(page);
  await page.evaluate(async () => {
    const { activeAccountScope } = await import('/src/offline/accountClient.js');
    const { writeRow, readRow } = await import('/src/offline/storage.js');
    const scope = activeAccountScope(); const owner = await readRow('accounts', scope);
    for (const [id,status,reviewId] of [['unsent','QUEUED',null],['failed','FAILED',null],['review','CONFLICT','server-review'],['posted','SUCCEEDED',null]]) {
      await writeRow('outbox', { key:`${scope}:${id}`, scope, operationId:id,status,reviewId,createdAt:1,nextAttemptAt:Date.now()+86400000 });
    }
    const other = { ...owner, scope:'other-org', user:{ ...owner.user,id:'different-user' },tenant:{ tenantId:'different-org' } };
    await writeRow('accounts',other); await writeRow('outbox',{ key:'other-org:unsent',scope:'other-org',status:'QUEUED',createdAt:1,nextAttemptAt:Date.now()+86400000 });
  });
  await page.getByRole('button',{ name:'More',exact:true }).click();
  await page.getByRole('button',{ name:'Sign out',exact:true }).first().click();
  return page.getByRole('dialog',{ name:'Delete unsynced payments and sign out?' });
}

test('offline sign-out warns with count; Cancel preserves payments and the session', async ({ page,context }) => {
  const dialog = await app(page); await context.setOffline(true);
  await expect(dialog).toContainText('2 unsynced payments will be permanently deleted');
  await dialog.getByRole('button',{ name:'Cancel',exact:true }).click();
  await expect(dialog).toHaveCount(0); await expectAuthenticatedShell(page);
  const result = await page.evaluate(async () => {
    const { readRows } = await import('/src/offline/storage.js');
    return { rows:(await readRows('outbox')).length,valid:(await readRows('accounts')).every(a=>a.sessionValid) };
  });
  expect(result).toEqual({ rows:5,valid:true });
});

test('confirmed offline sign-out discards only unsent work and it does not return after same-browser login', async ({ page,context }) => {
  const dialog = await app(page); await context.setOffline(true);
  await dialog.getByRole('button',{ name:'Sign out and delete' }).click();
  await expect(page).toHaveURL(/\/login/);
  await context.setOffline(false);
  const result = await page.evaluate(async () => {
    const { readRows } = await import('/src/offline/storage.js');
    const { rememberAccount } = await import('/src/offline/accountClient.js');
    const rows = await readRows('outbox'); const accounts = await readRows('accounts');
    const owner = accounts.find(a=>a.scope!=='other-org');
    await rememberAccount(owner.user,owner.tenant,'new-session');
    return { ids:rows.map(e=>e.operationId??e.key).sort(),ownerLocked:!owner.sessionValid,
      otherValid:accounts.find(a=>a.scope==='other-org').sessionValid,
      restoredUnsent:(await readRows('outbox')).some(e=>['unsent','failed'].includes(e.operationId)) };
  });
  expect(result).toEqual({ ids:['other-org:unsent','posted','review'],ownerLocked:true,otherValid:true,restoredUnsent:false });
});

test('atomic browser sign-out prevents stale claims and saves, and all-account sign-out checks every queue', async ({ page }) => {
  await app(page); await page.getByRole('dialog').getByRole('button',{ name:'Cancel' }).click();
  const result = await page.evaluate(async () => {
    const { inspectSignOut,completeVoluntarySignOut } = await import('/src/offline/signOut.js');
    const { activeAccountScope } = await import('/src/offline/accountClient.js');
    const { readRow,readRows,claimOutbox,saveOutboxForAccount } = await import('/src/offline/storage.js');
    const scope=activeAccountScope(); const old=await readRow('accounts',scope);
    const selection=await inspectSignOut(scope,true); await completeVoluntarySignOut(selection);
    let rejected=false;
    try { await saveOutboxForAccount(old,{ key:`${scope}:stale`,scope,businessHash:'stale' }); } catch { rejected=true; }
    return { count:selection.count,rejected,claimed:!!await claimOutbox(`${scope}:unsent`),
      rows:(await readRows('outbox')).map(e=>e.operationId).sort(),locked:(await readRows('accounts')).every(a=>!a.sessionValid) };
  });
  expect(result).toEqual({ count:3,rejected:true,claimed:false,rows:['posted','review'],locked:true });
});

test('forced session invalidation preserves unsent payments without a destructive prompt',async({page})=>{
  await app(page);await page.getByRole('dialog').getByRole('button',{name:'Cancel'}).click();
  await page.evaluate(async()=>{
    const {lockAccount,activeAccountScope}=await import('/src/offline/accountClient.js');
    const scope=activeAccountScope();await lockAccount(scope);
    window.dispatchEvent(new CustomEvent('auth:account-invalid',{detail:{scope}}));
  });
  await expect(page).toHaveURL(/\/login/);await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(async()=>{const {readRows}=await import('/src/offline/storage.js');return(await readRows('outbox')).length;})).toBe(5);
});
