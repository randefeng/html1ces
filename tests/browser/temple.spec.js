import { test, expect } from '@playwright/test';

const getStored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('sansa.temple.v1')));

async function enter(page) {
  await page.goto('/');
  await expect(page.locator('#scene-loading')).toBeHidden();
  await expect(page.locator('#scene-fallback')).toBeHidden();
  await expect(page.locator('#scene canvas')).toBeVisible();
}

test('desktop scene and all primary rituals work and persist', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await enter(page);
  await page.screenshot({ path: 'test-results/desktop.png', fullPage: true });
  await page.locator('[data-action="incense"]').click();
  await expect(page.locator('#today-count')).toHaveText('01');
  await page.keyboard.press('b');
  expect((await getStored(page)).bells).toBe(1);
  await page.locator('[data-action="wish"]').click();
  const wish = '愿家人健康 <img src=x onerror=alert(1)>';
  await page.locator('#wish-text').fill(wish);
  await page.getByRole('button', { name: '挂上心愿' }).click();
  await expect(page.locator('#panel-dialog')).not.toBeVisible();
  await page.getByRole('button', { name: '我的修行' }).click();
  await expect(page.locator('.saved-wish > p')).toHaveText(wish);
  await expect(page.locator('.saved-wish img')).toHaveCount(0);
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await page.getByRole('button', { name: '月夜', exact: true }).click();
  await page.locator('#rain-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-time', 'night');
  await expect(page.locator('#rain-toggle')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#sound-toggle').click();
  await expect(page.locator('#sound-toggle')).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({ path: 'test-results/night.png', fullPage: true });
  await page.reload();
  await expect(page.locator('#today-count')).toHaveText('01');
  await expect(page.locator('html')).toHaveAttribute('data-time', 'night');
  await expect(page.locator('#sound-toggle')).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: '我的修行' }).click();
  await expect(page.locator('.saved-wish > p')).toHaveText(wish);
  expect(errors).toEqual([]);
});

test('meditation counts active time, pauses and completes once', async ({ page }) => {
  // Install before application code creates timers to keep one consistent clock.
  await page.clock.install();
  await enter(page);
  await page.locator('.ritual-card[data-action="meditate"]').click();
  await page.locator('#meditation-start').click();
  await page.clock.fastForward(10000);
  await expect(page.locator('#meditation-timer')).toHaveText('02:50');
  await page.locator('#meditation-start').click();
  await page.clock.fastForward(5000);
  await expect(page.locator('#meditation-timer')).toHaveText('02:50');
  await page.locator('#meditation-start').click();
  await page.clock.fastForward(170000);
  await expect(page.locator('#meditation-title')).toHaveText('这一刻，已是礼物。');
  expect((await getStored(page)).meditationSeconds).toBe(180);
  await page.keyboard.press('Escape');
  await expect(page.locator('#meditation-dialog')).not.toBeVisible();
  await expect.poll(async () => (await getStored(page)).meditationSeconds).toBe(180);
  await page.locator('.ritual-card[data-action="meditate"]').click();
  await page.locator('#meditation-start').click();
  await page.clock.fastForward(3000);
  await page.keyboard.press('Escape');
  await expect(page.locator('#meditation-dialog')).not.toBeVisible();
  await expect.poll(async () => (await getStored(page)).meditationSeconds).toBe(183);
});

test('mobile layout fits and remains interactive', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enter(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/mobile.png', fullPage: true });
  await page.locator('[data-action="incense"]').click();
  await expect(page.locator('#today-count')).toHaveText('01');
  await page.getByRole('button', { name: '黄昏', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-time', 'dusk');
  await page.locator('[data-action="wish"]').click();
  await page.locator('#wish-text').fill('愿今天从容');
  await page.getByRole('button', { name: '挂上心愿' }).click();
  expect((await getStored(page)).wishes[0].text).toBe('愿今天从容');
});

test('separate tabs keep offerings and wishes in sync', async ({ page, context }) => {
  await enter(page);
  const other = await context.newPage();
  await enter(other);
  await page.locator('[data-action="incense"]').click();
  await expect(other.locator('#today-count')).toHaveText('01');
  await other.locator('[data-action="incense"]').click();
  await expect(page.locator('#today-count')).toHaveText('02');
  expect((await getStored(page)).incense).toBe(2);
  await other.close();
});

test('unavailable storage and WebGL degrade without blocking rituals', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new Error('storage blocked'); } });
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      return type.startsWith('webgl') ? null : getContext.call(this, type, ...args);
    };
  });
  await page.goto('/');
  await expect(page.locator('#scene-fallback')).toBeVisible();
  await page.locator('[data-action="incense"]').click();
  await expect(page.locator('#today-count')).toHaveText('01');
  await page.locator('[data-action="wish"]').click();
  await page.locator('#wish-text').fill('即使离线也愿平安');
  await page.getByRole('button', { name: '挂上心愿' }).click();
  await page.getByRole('button', { name: '我的修行' }).click();
  await expect(page.locator('.saved-wish > p')).toHaveText('即使离线也愿平安');
});
