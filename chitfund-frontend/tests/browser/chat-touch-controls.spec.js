import { test, expect } from '@playwright/test';
import { installAuthenticatedApp } from './fixtures';

test('phone chat exposes delete without hover and reports a failed delete', async ({ page }) => {
  await installAuthenticatedApp(page, {
    chatEnabled: true,
    resolveApi: ({ request, url, json }) => {
      if (url.pathname === '/api/conversations') return json({ items: [{
        id: 'conversation-1', memberId: 'member-1', memberName: 'Ravi Kumar',
        lastMessagePreview: 'Hello', lastMessageAt: new Date().toISOString(),
      }] });
      if (url.pathname === '/api/groups') return json({ items: [] });
      if (url.pathname === '/api/conversations/conversation-1/messages' && request.method() === 'GET') {
        return json({ items: [{ id: 'message-1', content: 'Hello',
          senderId: '00000000-0000-0000-0000-0000000000aa', senderName: 'Acceptance Admin',
          createdAt: new Date().toISOString(),
        }], nextCursor: null });
      }
      if (url.pathname === '/api/conversations/conversation-1/messages/message-1/delete') {
        return json({ message: 'Temporarily unavailable' }, 503);
      }
      return null;
    },
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/dashboard');
  await page.getByRole('button', { name: 'Open menu' }).click();
  await page.getByRole('button', { name: 'Messages', exact: true }).click();
  await page.getByRole('button', { name: /Ravi Kumar/ }).click();
  const deleteButton = page.getByRole('button', { name: 'Delete this message' });
  await expect(deleteButton).toBeVisible();
  await deleteButton.click();
  await expect(page.getByRole('alert')).toContainText('Could not delete the message');
  await expect(page.getByText('Hello', { exact: true })).toBeVisible();
});
