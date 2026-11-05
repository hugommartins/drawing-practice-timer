import { expect, linkViaUi, test } from './fixtures';

test('first run asks for a folder; cancelling the dialog changes nothing', async ({ app, harness }) => {
  await expect(app.getByTestId('empty-practice')).toBeVisible();
  await expect(app.getByTestId('start-session')).toHaveCount(0);
  await expect(app.getByTestId('stat-week')).toContainText('0m');
  harness.pickNext(null);
  await app.getByTestId('link-folder-cta').click();
  await expect(app.getByTestId('empty-practice')).toBeVisible();
  await expect(app.getByTestId('flash')).toHaveCount(0);
});

test('linking a folder names the type after the folder and enables Start', async ({ app, harness, makeFolder }) => {
  await linkViaUi(app, harness, makeFolder('Figure', 12));
  await expect(app.getByTestId('flash')).toContainText('"Figure"');
  await expect(app.getByTestId('ref-select')).toContainText('Figure · 12 images');
  await expect(app.getByTestId('start-session')).toBeEnabled();
  await expect(app.getByTestId('stat-library')).toContainText('12');
});

test('setup options follow the timer mode and survive a reload', async ({ app, harness, makeFolder }) => {
  await linkViaUi(app, harness, makeFolder('Figure', 6));
  await app.getByTestId('dur-300').click();
  await app.getByTestId('count-30').click();
  await app.reload();
  await expect(app.getByTestId('dur-300')).toHaveAttribute('aria-pressed', 'true');
  await expect(app.getByTestId('count-30')).toHaveAttribute('aria-pressed', 'true');

  await app.getByTestId('setup-mode-whole').click();
  await expect(app.getByTestId('count-30')).toHaveCount(0);
  await app.getByTestId('setup-mode-none').click();
  await expect(app.getByTestId('dur-custom')).toHaveCount(0);
});

test('an empty folder blocks Start with a reason', async ({ app, harness, makeFolder }) => {
  await linkViaUi(app, harness, makeFolder('Blank', 0));
  await expect(app.getByTestId('start-session')).toBeDisabled();
  await expect(app.getByTestId('start-blocker')).toContainText('no images');
});

test('theme cycles system, light, dark and persists', async ({ app }) => {
  const html = app.locator('html');
  await expect(html).toHaveAttribute('data-theme', 'system');
  await app.getByTestId('theme-toggle').click();
  await expect(html).toHaveAttribute('data-theme', 'light');
  await app.getByTestId('theme-toggle').click();
  await app.reload();
  await expect(html).toHaveAttribute('data-theme', 'dark');
});
