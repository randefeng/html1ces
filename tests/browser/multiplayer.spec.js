import { test, expect } from '@playwright/test';

async function enter(page) {
  await page.goto('/');
  await expect(page.locator('#scene-loading')).toBeHidden();
  await expect(page.locator('#scene-fallback')).toBeHidden();
  await expect(page.locator('body')).toHaveAttribute('data-connection', 'online');
}

async function position(page) {
  return page.locator('#scene').evaluate((element) => ({ x: Number(element.dataset.x), z: Number(element.dataset.z) }));
}

test('WASD moves a real monk, views switch, and rituals animate', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await enter(page);
  const before = await position(page);
  await page.keyboard.down('a');
  await expect.poll(async () => Math.abs((await position(page)).x - before.x)).toBeGreaterThan(0.45);
  await page.keyboard.up('a');
  await page.keyboard.press('1');
  await expect(page.locator('#scene')).toHaveAttribute('data-action', 'bow');
  await expect(page.locator('#monk-action')).toHaveText('正在跪拜');
  const beforeStanding = await position(page);
  await page.keyboard.down('d');
  await expect(page.locator('#scene')).toHaveAttribute('data-action', 'idle');
  await expect.poll(async () => Math.abs((await position(page)).x - beforeStanding.x)).toBeGreaterThan(0.45);
  await page.keyboard.up('d');
  await page.keyboard.press('2');
  await expect(page.locator('#scene')).toHaveAttribute('data-action', 'fish');
  await expect(page.locator('#scene')).toHaveAttribute('data-action', 'idle', { timeout: 8000 });
  await page.keyboard.press('3');
  await expect(page.locator('#scene')).toHaveAttribute('data-action', 'beads');
  await page.keyboard.press('v');
  await expect(page.locator('#scene')).toHaveAttribute('data-view', 'first');
  await page.keyboard.press('v');
  await expect(page.locator('#scene')).toHaveAttribute('data-view', 'overview');
  await page.keyboard.press('v');
  await expect(page.locator('#scene')).toHaveAttribute('data-view', 'third');
  const canvas = page.locator('#scene canvas');
  const rect = await canvas.boundingBox();
  await page.mouse.move(rect.width / 2, rect.height / 2);
  await page.mouse.down();
  await page.mouse.move(rect.width / 2 + 230, rect.height / 2 + 15, { steps: 12 });
  await page.mouse.up();
  await page.screenshot({ path: 'test-results/monk-face.png' });
  expect(errors).toEqual([]);
});

test('independent browsers share live positions, actions, room switching and leave', async ({ page, browser }) => {
  const otherContext = await browser.newContext();
  const other = await otherContext.newPage();
  const messages = [];
  other.on('websocket', (socket) => {
    socket.on('framereceived', ({ payload }) => {
      const data = JSON.parse(payload.toString());
      if (data.type === 'snapshot') messages.push(data);
    });
  });
  try {
    await enter(page);
    await enter(other);
    await expect(page.locator('#room-count')).toHaveText('2 / 12');
    await expect(other.locator('#room-count')).toHaveText('2 / 12');
    await expect(page.locator('#scene')).toHaveAttribute('data-remote-players', '1');
    await expect(other.locator('#scene')).toHaveAttribute('data-remote-players', '1');
    const before = await position(page);
    await page.keyboard.down('a');
    await expect.poll(async () => Math.abs((await position(page)).x - before.x)).toBeGreaterThan(0.55);
    await page.keyboard.up('a');
    const after = await position(page);
    await expect.poll(() => messages.at(-1)?.players.some((player) => Math.abs(player.x - after.x) < 0.15 && Math.abs(player.z - after.z) < 0.15)).toBe(true);
    await page.keyboard.press('2');
    await expect.poll(() => messages.at(-1)?.players.some((player) => player.action === 'fish')).toBe(true);
    await expect(other.locator('#scene')).toHaveAttribute('data-remote-actions', 'fish');
    await page.locator('#room-button').click();
    await page.getByRole('button', { name: /松风二室/ }).click();
    await expect(page.locator('#room-button')).toContainText('松风二室');
    await expect(page.locator('#room-count')).toHaveText('1 / 12');
    await expect(other.locator('#room-count')).toHaveText('1 / 12');
    await expect(other.locator('#scene')).toHaveAttribute('data-remote-players', '0');
    await page.locator('#room-button').click();
    await page.getByRole('button', { name: /清静一室/ }).click();
    await expect(other.locator('#scene')).toHaveAttribute('data-remote-players', '1');
    await page.screenshot({ path: 'test-results/multiplayer.png' });
    await otherContext.close();
    await expect(page.locator('#room-count')).toHaveText('1 / 12');
    await expect(page.locator('#scene')).toHaveAttribute('data-remote-players', '0');
  } finally {
    await otherContext.close();
  }
});

test('WebSocket disconnect clears remote players and rejoins automatically', async ({ page }) => {
  let socket;
  await page.addInitScript(() => {
    const NativeWebSocket = window.WebSocket;
    window.WebSocket = class extends NativeWebSocket {
      constructor(...args) {
        super(...args);
        window.templeTestSocket = this;
      }
    };
  });
  await enter(page);
  socket = await page.evaluate(() => {
    window.templeTestSocket.close(1000, 'reconnect test');
    return true;
  });
  expect(socket).toBe(true);
  await expect(page.locator('body')).toHaveAttribute('data-connection', 'offline');
  await expect(page.locator('#room-button')).toBeDisabled();
  await expect(page.locator('#scene')).toHaveAttribute('data-remote-players', '0');
  await expect(page.locator('body')).toHaveAttribute('data-connection', 'online', { timeout: 8000 });
  await expect(page.locator('#room-button')).toBeEnabled();
  await expect(page.locator('#room-count')).toHaveText('1 / 12');
});

test('touch joystick moves and cancels cleanly, no horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enter(page);
  const before = await position(page);
  const stick = page.locator('#mobile-stick');
  await expect(stick).toBeVisible();
  const rect = await stick.boundingBox();
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await page.mouse.down();
  await page.mouse.move(rect.x + 5, rect.y + rect.height / 2, { steps: 4 });
  await expect.poll(async () => Math.abs((await position(page)).x - before.x)).toBeGreaterThan(0.25);
  await page.mouse.up();
  const stopped = await position(page);
  await page.waitForTimeout(300);
  expect(Math.abs((await position(page)).x - stopped.x)).toBeLessThan(0.1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
