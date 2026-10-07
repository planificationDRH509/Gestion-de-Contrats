import { expect, test } from '@playwright/test';

test('tasks and independent notes remain usable on desktop and mobile', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('contribution_auth', JSON.stringify({ id: 'ux-test', username: 'admin', name: 'Test', workspaceId: 'workspace_default', role: 'admin', taskSessionToken: 'test-token' }));
    localStorage.setItem('contribution_last_activity', String(Date.now()));
  });
  await page.route('**/*.supabase.co/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const base = { status: 'todo', completed: false, completed_at: null, created_at: '2026-10-06T12:00:00Z', updated_at: '2026-10-06T12:00:00Z', created_by: 'ux-test', created_by_name: 'Test', created_by_username: 'admin' };
    const body = path.endsWith('/app_users') ? { role: 'admin' } : path.endsWith('/list_private_tasks') ? [
      { ...base, id: 'task-ux', kind: 'task', content: 'Préparer les contrats', notes: '' },
      { ...base, id: 'note-ux', kind: 'note', content: 'Réunion du lundi', notes: 'Vérifier les dossiers avant la prochaine réunion.\nAppeler le service administratif.' }
    ] : [];
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('http://127.0.0.1:5179/app/taches');
  await expect(page.getByText('Préparer les contrats', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Réunion du lundi' })).toBeVisible();
  await page.screenshot({ path: '/tmp/tasks-notes-desktop.png', fullPage: true });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(page.getByRole('link', { name: /Notes/ })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByRole('button', { name: 'Réunion du lundi' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Enregistrer', exact: true })).toBeVisible();
    await page.screenshot({ path: `/tmp/tasks-notes-editor-${width}.png` });
    await page.getByRole('button', { name: 'Annuler', exact: true }).click();
    await page.getByRole('button', { name: 'view_kanban Kanban' }).click();
    await expect(page.getByLabel('Tableau Kanban')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByRole('button', { name: 'view_list Liste' }).click();
  }
  await page.screenshot({ path: '/tmp/tasks-notes-mobile.png', fullPage: true });
});
