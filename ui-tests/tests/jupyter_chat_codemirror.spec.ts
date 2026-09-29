import { expect, test } from '@jupyterlab/galata';

test('registers and activates the chat input factory', async ({ page }) => {
  const status = await page.evaluate(() => ({
    registered: window.jupyterapp.hasPlugin('jupyter-chat-codemirror:plugin'),
    activated: window.jupyterapp.isPluginActivated(
      'jupyter-chat-codemirror:plugin'
    )
  }));

  expect(status).toEqual({ registered: true, activated: true });
});
