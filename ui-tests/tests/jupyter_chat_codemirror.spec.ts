import type { IChatCommandRegistry, IChatTracker } from '@jupyter/chat';
import type {
  ICompletionProviderManager,
  IInlineCompleterSettings
} from '@jupyterlab/completer';
import { expect, test } from '@jupyterlab/galata';
import type { ISettingRegistry } from '@jupyterlab/settingregistry';
import type { Page } from '@playwright/test';

const TEST_PROVIDER = 'jupyter-chat-codemirror:test-inline';

async function readDraft(page: Page): Promise<string> {
  return page.evaluate(() =>
    window.jupyterapp.commands.execute('jupyter-chat-codemirror:test-draft')
  );
}

test('registers and activates the chat input and completion plugins', async ({
  page
}) => {
  const status = await page.evaluate(() => ({
    inputRegistered: window.jupyterapp.hasPlugin(
      'jupyter-chat-codemirror:plugin'
    ),
    inputActivated: window.jupyterapp.isPluginActivated(
      'jupyter-chat-codemirror:plugin'
    ),
    completionRegistered: window.jupyterapp.hasPlugin(
      'jupyter-chat-codemirror:completion'
    ),
    completionActivated: window.jupyterapp.isPluginActivated(
      'jupyter-chat-codemirror:completion'
    )
  }));

  expect(status).toEqual({
    inputRegistered: true,
    inputActivated: true,
    completionRegistered: true,
    completionActivated: true
  });
});

for (const inSidePanel of [false, true]) {
  test(`uses native inline completions in ${inSidePanel ? 'sidebar' : 'main'} composer and message edit`, async ({
    page
  }, testInfo) => {
    await page.evaluate(async providerId => {
      const app = window.jupyterapp;
      // Galata owns browser-side service discovery; the fixture uses the real
      // host services and their ordinary public interfaces.
      const manager = (await window.galata.getPlugin(
        '@jupyterlab/completer-extension:manager'
      )) as ICompletionProviderManager | undefined;
      const tracker = (await window.galata.getPlugin(
        'jupyterlab-chat-extension:tracker' as never
      )) as IChatTracker | undefined;
      const registry = (await window.galata.getPlugin(
        'jupyterlab-chat-extension:chatCommandRegistry' as never
      )) as IChatCommandRegistry | undefined;
      const settingRegistry = (await window.galata.getPlugin(
        '@jupyterlab/apputils-extension:settings'
      )) as ISettingRegistry | undefined;
      if (!manager?.inline || !tracker || !registry || !settingRegistry) {
        throw new Error(
          'Native completer and matching Jupyter Chat fork are required'
        );
      }
      app.commands.addCommand('jupyter-chat-codemirror:test-draft', {
        execute: () => tracker.currentWidget?.model.input.value ?? ''
      });
      app.commands.addCommand('jupyter-chat-codemirror:test-config', {
        execute: args => {
          const input = tracker.currentWidget?.model.input;
          if (input) {
            input.config = { sendWithShiftEnter: Boolean(args.shift) };
            input.focus();
          }
        }
      });
      registry.addProvider({
        id: 'codemirror-test-commands',
        listCommandCompletions: async input => {
          const prefix = input.currentWord;
          if (prefix !== '/cm' && prefix !== '@cm') {
            return [];
          }
          return ['one', 'two'].map(suffix => ({
            name: `${prefix}-${suffix}`,
            providerId: 'codemirror-test-commands',
            replaceWith: `${prefix[0]}chosen-${suffix}`,
            spaceOnAccept: true
          }));
        },
        onSubmit: async () => {
          document.body.dataset.chatSubmitCalls = String(
            Number(document.body.dataset.chatSubmitCalls ?? 0) + 1
          );
        }
      });

      if (
        !(manager.inlineProviders ?? []).some(
          provider => provider.identifier === providerId
        )
      ) {
        manager.registerInlineProvider({
          identifier: providerId,
          name: 'Deterministic chat test provider',
          fetch: async (request, context) => {
            document.body.dataset.nativeTrackedPanel = String(
              tracker.has(context.widget)
            );
            document.body.dataset.nativeEditorAlive = String(
              context.editor != null && !context.editor.isDisposed
            );
            document.body.dataset.nativeChatArea =
              context.widget.area ?? 'main';
            const prefix = request.text.slice(0, request.offset);
            if (prefix.endsWith('slow')) {
              document.body.dataset.inlineSlowStarted = 'true';
              await new Promise(resolve => window.setTimeout(resolve, 150));
              return { items: [{ insertText: ' stale' }] };
            }
            if (prefix.endsWith('hello')) {
              return { items: [{ insertText: ' world' }] };
            }
            if (prefix.endsWith('edit')) {
              return { items: [{ insertText: ' accepted' }] };
            }
            return { items: [] };
          }
        });
      }

      const settings = await settingRegistry.load(
        '@jupyterlab/completer-extension:inline-completer'
      );
      const defaults =
        settings.composite as unknown as IInlineCompleterSettings;
      manager.inline.configure({
        ...defaults,
        providers: {
          ...defaults.providers,
          [providerId]: {
            enabled: true,
            timeout: 1000,
            debouncerDelay: 0,
            autoFillInMiddle: false
          }
        }
      });
    }, TEST_PROVIDER);

    const chatName = `native-inline-${Date.now()}`;
    await page.evaluate(
      args =>
        window.jupyterapp.commands.execute(
          'jupyterlab-chat:createAndOpen',
          args
        ),
      { name: chatName, inSidePanel }
    );

    const composer = page
      .locator('.jp-jupyter-chat-codemirror-input .cm-content')
      .last();
    await expect(composer).toBeVisible();
    await composer.click();
    await composer.press('ControlOrMeta+A');
    await composer.press('Backspace');
    await composer.type('hello');

    const ghost = page.locator(
      `.jp-GhostText[data-provided-by="${TEST_PROVIDER}"]`
    );
    await expect(ghost).toContainText(' world');

    // Keep the user's global JupyterLab inline-completer setting intact while
    // suppressing only the floating controls over the focused chat editor.
    const inlineWidget = page.locator('.jp-InlineCompleter').last();
    await expect(inlineWidget).toHaveAttribute('data-display', 'onHover');
    await expect(page.locator('body')).toHaveAttribute(
      'data-jupyter-chat-codemirror-focused',
      'true'
    );
    await ghost.hover();
    expect(
      await inlineWidget.evaluate(node => getComputedStyle(node).display)
    ).toBe('none');

    await expect(page.locator('body')).toHaveAttribute(
      'data-native-tracked-panel',
      'true'
    );
    await expect(page.locator('body')).toHaveAttribute(
      'data-native-editor-alive',
      'true'
    );
    await expect(page.locator('body')).toHaveAttribute(
      'data-native-chat-area',
      inSidePanel ? 'sidebar' : 'main'
    );
    await testInfo.attach('native-composer-ghost', {
      body: await page.screenshot(),
      contentType: 'image/png'
    });

    // This is the standard JupyterLab inline-completer Tab path. It must insert
    // into the draft without submitting the chat message.
    await composer.press('Tab');
    await expect(ghost).toHaveCount(0);
    expect(await readDraft(page)).toBe('hello world');
    await expect(page.locator('.jp-chat-message-container')).toHaveCount(0);
    await expect(page.locator('body')).not.toHaveAttribute(
      'data-chat-submit-calls'
    );

    // The deterministic command popup retains navigation, replacement and Enter
    // acceptance, independently of the native natural-language provider.
    for (const prefix of ['/cm', '@cm']) {
      await composer.press('ControlOrMeta+A');
      await composer.press('Backspace');
      await composer.type(prefix);
      const options = page.locator('.cm-tooltip-autocomplete [role="option"]');
      await expect(options).toHaveCount(2);
      await expect(options.first()).toHaveAttribute('aria-selected', 'true');
      // CodeMirror deliberately ignores navigation for 75 ms after opening.
      await page.waitForTimeout(100);
      await composer.press('ArrowDown');
      await expect(options.last()).toHaveAttribute('aria-selected', 'true');
      await composer.press('Enter');
      await expect(options).toHaveCount(0);
      expect(await readDraft(page)).toBe(`${prefix[0]}chosen-two `);
      await expect(page.locator('.jp-chat-message-container')).toHaveCount(0);
    }

    // Shift+Enter inserts a newline under the default Enter-to-send setting.
    await composer.press('ControlOrMeta+A');
    await composer.type('first');
    await composer.press('Shift+Enter');
    await composer.type('second');
    expect(await readDraft(page)).toBe('first\nsecond');
    await expect(page.locator('.jp-chat-message-container')).toHaveCount(0);

    // A slow reply for an older draft must not appear after a newer edit.
    await composer.press('ControlOrMeta+A');
    await composer.press('Backspace');
    await composer.type('slow');
    await expect(page.locator('body')).toHaveAttribute(
      'data-inline-slow-started',
      'true'
    );
    await composer.type('x');
    await page.waitForTimeout(250);
    await expect(ghost).toHaveCount(0);

    // Send one message so the same input factory is exercised in edit mode.
    await composer.press('ControlOrMeta+A');
    await composer.press('Backspace');
    await composer.type('hello');
    await expect(ghost).toContainText(' world');
    await composer.press('Tab');
    await expect(ghost).toHaveCount(0);
    expect(await readDraft(page)).toBe('hello world');
    await composer.press('Enter');

    const message = page.locator('.jp-chat-message-container').last();
    await expect(message).toBeVisible();
    await message.hover();
    await message.getByRole('button', { name: 'Edit' }).click();

    const messageEditor = message.locator(
      '.jp-jupyter-chat-codemirror-input .cm-content'
    );
    await expect(messageEditor).toBeVisible();
    await messageEditor.click();
    await messageEditor.press('ControlOrMeta+A');
    await messageEditor.type('edit');
    await expect(ghost).toContainText(' accepted');
    await testInfo.attach('native-message-edit-ghost', {
      body: await page.screenshot(),
      contentType: 'image/png'
    });
    await messageEditor.press('Tab');
    await expect(ghost).toHaveCount(0);
    await expect(messageEditor).toHaveText('edit accepted');

    // Tab acceptance must not submit/update the message. Escape cancels editing,
    // and the surviving composer must become the native completion target again.
    await expect(page.locator('.jp-chat-message-container')).toHaveCount(1);
    await messageEditor.press('Escape');
    await expect(messageEditor).toHaveCount(0);
    await expect(message.locator('.jp-chat-rendered-message')).toContainText(
      'hello world'
    );
    await expect(page.locator('body')).toHaveAttribute(
      'data-chat-submit-calls',
      '1'
    );

    await composer.click();
    await composer.press('ControlOrMeta+A');
    await composer.press('Backspace');
    await composer.type('hello');
    await expect(ghost).toContainText(' world');
    await composer.press('Tab');
    expect(await readDraft(page)).toBe('hello world');

    // A config change and model focus request preserve completions and the
    // alternative Shift+Enter send shortcut.
    await page.evaluate(() =>
      window.jupyterapp.commands.execute(
        'jupyter-chat-codemirror:test-config',
        {
          shift: true
        }
      )
    );
    await expect(composer).toBeFocused();
    await composer.press('Enter');
    await composer.type('next');
    expect(await readDraft(page)).toBe('hello world\nnext');
    await expect(page.locator('.jp-chat-message-container')).toHaveCount(1);
    await composer.press('Shift+Enter');
    await expect(page.locator('.jp-chat-message-container')).toHaveCount(2);
    await expect(page.locator('body')).toHaveAttribute(
      'data-chat-submit-calls',
      '2'
    );
  });
}
