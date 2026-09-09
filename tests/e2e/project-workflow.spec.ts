import {test,expect} from '@playwright/test';
import * as Y from 'yjs';
import {makeTemplate,bytesToBase64} from '../../src/lib/model';

test('create projects in the UI, move by menu and sidebar, preserve the original board URL',async({page})=>{
  test.setTimeout(120000);page.setDefaultTimeout(20000);
  const api=async(action:string,data:Record<string,unknown>={})=>{const r=await page.context().request.post('/api',{data:{action,...data}});expect(r.ok()).toBeTruthy();return r.json()};
  await api('auth.register',{name:'QA Project workflow',email:`qa-project-${crypto.randomUUID()}@canvaslab.test`,password:crypto.randomUUID()});
  const data=await api('dashboard'),first=data.projects[0];const board=(await api('board.create',{project_id:first.id,name:'A board that travels',initial_update:bytesToBase64(Y.encodeStateAsUpdate(makeTemplate('flowchart')))})).board;
  const before=await api('board.export',{board_id:board.id});await page.goto('/');await page.getByLabel('New project',{exact:true}).click();await page.getByLabel('Project name',{exact:true}).fill('Product discovery');await page.getByRole('button',{name:'Create project',exact:true}).click();
  await expect(page.getByRole('navigation',{name:'Projects',exact:true}).getByRole('button',{name:'Product discovery',exact:false})).toBeVisible();const next=(await api('dashboard')).projects.find((p:any)=>p.name==='Product discovery');
  await page.getByRole('button',{name:'Home',exact:true}).click();await page.getByLabel('Actions for A board that travels').click();await page.getByRole('button',{name:'Move to…',exact:true}).click();await page.getByRole('dialog').getByRole('combobox',{name:'Project',exact:true}).selectOption(next.id);
  await expect(page.getByRole('button',{name:'Move board',exact:true})).toBeDisabled();await page.getByLabel('I understand that project access will change.').check();await page.getByRole('button',{name:'Move board',exact:true}).click();
  await expect.poll(async()=>(await api('board.get',{board_id:board.id})).board.project_id).toBe(next.id);
  await page.getByRole('button',{name:'Open A board that travels',exact:true}).click();await expect(page).toHaveURL(new RegExp(`/board/${board.id}$`));await expect(page.getByText('All changes saved')).toBeVisible({timeout:60000});await expect(page.getByText('Explore the idea',{exact:true})).toBeVisible();
  await page.getByLabel('Back to project').click();const card=page.locator('.d-board-card').filter({has:page.getByRole('button',{name:'Open A board that travels',exact:true})});const destination=page.getByRole('navigation',{name:'Projects',exact:true}).getByRole('button',{name:first.name,exact:false});await card.dragTo(destination);
  await expect(page.getByRole('dialog')).toBeVisible();await page.getByLabel('I understand that project access will change.').check();await page.getByRole('button',{name:'Move board',exact:true}).click();await expect.poll(async()=>(await api('board.get',{board_id:board.id})).board.project_id).toBe(first.id);
  const after=await api('board.export',{board_id:board.id});expect(after.objects).toEqual(before.objects);await page.goto(`/board/${board.id}`);await expect(page.getByText('All changes saved')).toBeVisible({timeout:60000});await expect(page.getByText('Explore the idea',{exact:true})).toBeVisible();
});
