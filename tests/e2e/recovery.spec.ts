import {test,expect,chromium} from '@playwright/test';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const baseURL=process.env.BASE_URL||'http://localhost:3100';

test('pending offline edit recovers after completely closing and reopening the browser',async()=>{
  test.setTimeout(120000);const directory=await mkdtemp(join(tmpdir(),'canvaslab-recovery-'));
  let context=await chromium.launchPersistentContext(directory,{headless:true,baseURL,viewport:{width:1440,height:900}});
  try{
    const api=async(action:string,data:Record<string,unknown>={})=>{const r=await context.request.post('/api',{data:{action,...data}});expect(r.ok()).toBeTruthy();return r.json()};
    await api('auth.register',{name:'QA Device recovery',email:`qa-recovery-${crypto.randomUUID()}@canvaslab.test`,password:crypto.randomUUID()});const d=await api('dashboard');const board=(await api('board.create',{project_id:d.projects[0].id,name:'QA Pending device edits'})).board;
    let page=await context.newPage();await page.goto(`/board/${board.id}`);await expect(page.getByText('All changes saved')).toBeVisible({timeout:60000});await context.setOffline(true);await expect(page.locator('.save-status')).toContainText('Offline');
    await page.keyboard.press('s');await page.mouse.click(400,300);await page.getByLabel('Edit object text').fill('Recovered after the browser was closed');await page.keyboard.press('Escape');
    // Allow the asynchronous IndexedDB transaction to commit before normal browser shutdown.
    await page.waitForFunction(async()=>{const databases=await indexedDB.databases();const name=databases.find(d=>d.name?.startsWith('canvaslab:'))?.name;if(!name)return false;return new Promise<boolean>(resolve=>{const r=indexedDB.open(name);r.onsuccess=()=>{const db=r.result;if(!db.objectStoreNames.contains('updates')){db.close();resolve(false);return}const count=db.transaction('updates').objectStore('updates').count();count.onsuccess=()=>{const has=count.result>1;db.close();resolve(has)};r.onerror=()=>resolve(false)}})});
    const notYetSaved=await api('board.export',{board_id:board.id});expect(notYetSaved.objects.some((o:any)=>o.text==='Recovered after the browser was closed')).toBe(false);
    await context.close();context=await chromium.launchPersistentContext(directory,{headless:true,baseURL,viewport:{width:1440,height:900}});page=await context.newPage();await page.goto(`/board/${board.id}`);await expect(page.getByText('Recovered after the browser was closed',{exact:true})).toBeVisible({timeout:60000});await expect(page.getByText('All changes saved')).toBeVisible({timeout:60000});
    const result=await api('board.export',{board_id:board.id});expect(result.objects.some((o:any)=>o.text==='Recovered after the browser was closed')).toBeTruthy();await page.screenshot({path:'artifacts/device-recovery.png'});
  }finally{await context.close();await rm(directory,{recursive:true,force:true})}
});
