import { test, expect, type BrowserContext, type Page } from '@playwright/test';

test.use({ baseURL: process.env.BASE_URL || 'http://localhost:3100' });

interface ExportedObject {
  id: string;
  type: string;
  text?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fromId?: string;
  toId?: string;
  fromAnchor?: string;
  toAnchor?: string;
}
interface BoardExport { objects: ExportedObject[] }

async function api<T>(context: BrowserContext, action: string, data: Record<string, unknown> = {}): Promise<T> {
  const response = await context.request.post('/api', { data: { action, ...data } });
  const body = await response.json();
  expect(response.ok(), `${action}: ${JSON.stringify(body)}`).toBeTruthy();
  return body as T;
}

async function openFreshBoard(page: Page, name: string) {
  await api(page.context(), 'auth.register', {
    name: 'QA Toolbar interactions',
    email: `qa-toolbar-${crypto.randomUUID()}@canvaslab.test`,
    password: crypto.randomUUID(),
  });
  const dashboard = await api<{ projects: { id: string }[] }>(page.context(), 'dashboard');
  const { board } = await api<{ board: { id: string } }>(page.context(), 'board.create', {
    project_id: dashboard.projects[0].id,
    name,
  });
  await page.goto(`/board/${board.id}`);
  await expect(page.getByLabel('Collaborative board canvas')).toBeVisible();
  await expect(page.getByText('All changes saved')).toBeVisible({ timeout: 60_000 });
  return board.id;
}

async function dragTool(page: Page, label: string, x: number, y: number) {
  const tool = page.getByRole('toolbar', { name: 'Canvas tools' }).getByRole('button', { name: label, exact: true });
  const box = await tool.boundingBox();
  expect(box, `${label} must have a pointer target`).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(x, y, { steps: 18 });
  await page.mouse.up();
}

async function exported(page: Page, boardId: string) {
  return api<BoardExport>(page.context(), 'board.export', { board_id: boardId });
}

async function dismissTextEditor(page: Page) {
  if (await page.getByLabel('Edit object text').isVisible()) await page.keyboard.press('Escape');
}

test('drag a sticky note from the toolbar, edit it, and recover it after reload', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const boardId = await openFreshBoard(page, 'QA · Toolbar sticky drag');
  await dragTool(page, 'Sticky note (S)', 440, 320);
  await expect(page.getByLabel('Edit object text')).toBeVisible();
  await page.getByLabel('Edit object text').fill('Dragged from the toolbar\nReady for collaboration');
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await exported(page, boardId)).objects.filter(object => object.type === 'sticky').length).toBe(1);
  const sticky = (await exported(page, boardId)).objects.find(object => object.type === 'sticky')!;
  expect(sticky.text).toBe('Dragged from the toolbar\nReady for collaboration');
  const visibleSticky = page.locator(`[data-object-id="${sticky.id}"]`);
  const box = await visibleSticky.boundingBox();
  expect(box).not.toBeNull();
  // Dropping must place the object under the pointer, not leave it over the toolbar.
  expect(440).toBeGreaterThanOrEqual(box!.x - 2);
  expect(440).toBeLessThanOrEqual(box!.x + box!.width + 2);
  expect(320).toBeGreaterThanOrEqual(box!.y - 2);
  expect(320).toBeLessThanOrEqual(box!.y + box!.height + 2);
  await expect(page.getByText('All changes saved')).toBeVisible();
  await page.reload();
  await expect(page.getByText('Dragged from the toolbar', { exact: false })).toBeVisible();
  expect((await exported(page, boardId)).objects.find(object => object.id === sticky.id)?.text).toBe(sticky.text);
  expect(errors).toEqual([]);
});

test('click Section and draw a frame with the pointer-defined dimensions', async ({ page }) => {
  const boardId = await openFreshBoard(page, 'QA · Draw section bounds');
  await page.getByRole('toolbar', { name: 'Canvas tools' }).getByRole('button', { name: 'Section', exact: true }).click();
  await page.mouse.move(240, 220);
  await page.mouse.down();
  await page.mouse.move(820, 560, { steps: 18 });
  await page.mouse.up();
  await dismissTextEditor(page);
  await expect.poll(async () => (await exported(page, boardId)).objects.filter(object => object.type === 'section').length).toBe(1);
  const section = (await exported(page, boardId)).objects.find(object => object.type === 'section')!;
  expect(section.width).toBeGreaterThan(300);
  expect(section.height).toBeGreaterThan(180);
  // A click-sized default frame must not be substituted for the requested drag area.
  expect(section.width).toBeCloseTo(580, 0);
  expect(section.height).toBeCloseTo(340, 0);
  await page.reload();
  await expect(page.locator(`[data-object-id="${section.id}"]`)).toBeVisible();
  const restored = (await exported(page, boardId)).objects.find(object => object.id === section.id)!;
  expect(restored.width).toBe(section.width);
  expect(restored.height).toBe(section.height);
});

test('drag Shapes from the toolbar and connect a selected shape from its outside edge', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const boardId = await openFreshBoard(page, 'QA · Outside edge connectors');
  await dragTool(page, 'Shapes', 380, 355);
  await dismissTextEditor(page);
  await dragTool(page, 'Shapes', 870, 355);
  await dismissTextEditor(page);
  await expect.poll(async () => (await exported(page, boardId)).objects.filter(object => object.type === 'rounded').length).toBe(2);
  const [source, target] = (await exported(page, boardId)).objects.filter(object => object.type === 'rounded').sort((a, b) => a.x - b.x);
  const sourceObject = page.locator(`[data-object-id="${source.id}"]`);
  const targetObject = page.locator(`[data-object-id="${target.id}"]`);
  const sourceBox = await sourceObject.boundingBox();
  const targetBox = await targetObject.boundingBox();
  expect(sourceBox).not.toBeNull();
  expect(targetBox).not.toBeNull();
  await page.getByRole('button', { name: 'Select (V)', exact: true }).click();
  await page.mouse.click(sourceBox!.x + sourceBox!.width / 2, sourceBox!.y + sourceBox!.height / 2);
  await page.mouse.move(sourceBox!.x + sourceBox!.width + 12, sourceBox!.y + sourceBox!.height / 2);
  const anchor = page.locator(`[data-connector-object="${source.id}"][data-connector-anchor="right"]`);
  await expect(anchor).toBeVisible();
  const anchorBox = await anchor.boundingBox();
  expect(anchorBox).not.toBeNull();
  await page.mouse.move(anchorBox!.x + anchorBox!.width / 2, anchorBox!.y + anchorBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox!.x + targetBox!.width / 2, targetBox!.y + targetBox!.height / 2, { steps: 18 });
  await page.mouse.up();
  await expect.poll(async () => (await exported(page, boardId)).objects.filter(object => object.type === 'connector').length).toBe(1);
  const connector = (await exported(page, boardId)).objects.find(object => object.type === 'connector')!;
  expect(connector.fromId).toBe(source.id);
  expect(connector.toId).toBe(target.id);
  expect(connector.fromAnchor).toBe('right');

  // Move the target through the UI, then verify persistence retains the binding.
  await page.getByRole('button', { name: 'Select (V)', exact: true }).click();
  await page.mouse.move(targetBox!.x + targetBox!.width / 2, targetBox!.y + targetBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox!.x + targetBox!.width / 2 + 75, targetBox!.y + targetBox!.height / 2 + 95, { steps: 12 });
  await page.mouse.up();
  await expect.poll(async () => (await exported(page, boardId)).objects.find(object => object.id === target.id)?.y).toBeGreaterThan(target.y + 50);
  await expect(page.getByText('All changes saved')).toBeVisible();
  await page.reload();
  await expect(page.locator(`[data-object-id="${connector.id}"]`)).toBeVisible();
  const restored = (await exported(page, boardId)).objects.find(object => object.id === connector.id)!;
  expect(restored.fromId).toBe(source.id);
  expect(restored.toId).toBe(target.id);
  expect(restored.fromAnchor).toBe('right');
  expect(errors).toEqual([]);
});

test('frame toolbar drag, smooth pointer zoom, pan and seamless page location', async ({page})=>{
  const boardId=await openFreshBoard(page,'QA · Smooth canvas navigation');
  await dragTool(page,'Section',500,360);
  await expect.poll(async()=>(await exported(page,boardId)).objects.filter(o=>o.type==='section').length).toBe(1);
  const readCamera=async()=>page.locator('.infinite-canvas > g').first().getAttribute('transform').then(v=>{const n=v!.match(/-?[\d.]+(?:e[+-]?\d+)?/g)!.map(Number);return {x:n[0],y:n[1],zoom:n[2]}});
  const before=await readCamera(),pointer={x:780,y:510};
  await page.mouse.move(pointer.x,pointer.y);await page.keyboard.down('Control');await page.mouse.wheel(0,-160);await page.keyboard.up('Control');
  await expect.poll(async()=>(await readCamera()).zoom).toBeGreaterThan(before.zoom*1.6);
  const zoomed=await readCamera();
  expect((pointer.x-zoomed.x)/zoomed.zoom).toBeCloseTo((pointer.x-before.x)/before.zoom,3);
  expect((pointer.y-zoomed.y)/zoomed.zoom).toBeCloseTo((pointer.y-before.y)/before.zoom,3);
  // Direct panning cancels remaining wheel interpolation and stays under the hand.
  await page.keyboard.down('Space');await page.mouse.move(1000,600);await page.mouse.down();const panStart=await readCamera();await page.mouse.move(1110,670,{steps:10});await page.mouse.up();await page.keyboard.up('Space');
  const panned=await readCamera();expect(panned.x-panStart.x).toBeCloseTo(110,1);expect(panned.y-panStart.y).toBeCloseTo(70,1);
  await page.getByLabel('Switch page').click();await page.getByLabel('Create page',{exact:true}).click();await expect(page.getByLabel('Switch page')).toContainText('Page 2');
  await page.getByLabel('Switch page').click();await page.getByRole('menuitem',{name:'Page 1',exact:true}).click();
  expect(await readCamera()).toEqual(panned);
  await page.screenshot({path:'artifacts/smooth-canvas-navigation.png'});
});

test('shape palette drag, edge resize and quick-connect to the nearest shape',async({page})=>{
  const boardId=await openFreshBoard(page,'QA · Quick create and resizing');
  await dragTool(page,'Shapes',390,350);await dragTool(page,'Shapes',790,350);
  const shapes=(await exported(page,boardId)).objects.filter(o=>o.type==='rounded').sort((a,b)=>a.x-b.x);
  await expect.poll(async()=>(await exported(page,boardId)).objects.filter(o=>o.type==='rounded').length).toBe(2);
  const source=shapes[0]||(await exported(page,boardId)).objects.filter(o=>o.type==='rounded').sort((a,b)=>a.x-b.x)[0];
  await page.locator(`[data-object-id="${source.id}"]`).click();await page.locator(`[data-connector-object="${source.id}"][data-connector-anchor="right"]`).click();
  await expect.poll(async()=>(await exported(page,boardId)).objects.filter(o=>o.type==='connector').length).toBe(1);
  const edge=(await exported(page,boardId)).objects.find(o=>o.type==='connector')!;expect(edge.fromId).toBe(source.id);expect(edge.toId).toBeTruthy();
  await page.getByRole('button',{name:'Shapes',exact:true}).click();const ellipse=page.getByRole('button',{name:'Ellipse',exact:true}),bb=await ellipse.boundingBox();await page.mouse.move(bb!.x+bb!.width/2,bb!.y+bb!.height/2);await page.mouse.down();await page.mouse.move(700,610,{steps:16});await page.mouse.up();
  await expect.poll(async()=>(await exported(page,boardId)).objects.filter(o=>o.type==='ellipse').length).toBe(1);
  const shape=(await exported(page,boardId)).objects.find(o=>o.type==='ellipse')!;
  const handle=page.locator('[data-handle="se"]'),hb=await handle.boundingBox();await page.mouse.move(hb!.x+hb!.width/2,hb!.y+hb!.height/2);await page.mouse.down();await page.mouse.move(hb!.x+hb!.width/2+63,hb!.y+hb!.height/2+42,{steps:12});await page.mouse.up();
  await expect.poll(async()=>(await exported(page,boardId)).objects.find(o=>o.id===shape.id)?.width).toBeCloseTo(shape.width+63,0);
  await page.getByText('All changes saved').waitFor();await page.screenshot({path:'artifacts/quick-connect-shapes.png'});
});
