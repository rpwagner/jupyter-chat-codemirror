import { expect, test } from '@jupyterlab/galata';
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
  }) => {
    await page.evaluate(async providerId => {
      const app = window.jupyterapp;
      const managerTokenName =
        '@jupyterlab/completer:ICompletionProviderManager';

      type NamedToken = { name?: string };
      type RegistryLike = {
        _serviceMap?: Map<NamedToken, string>;
        _pluginRegistry?: RegistryLike;
      };
      type CompletionManagerLike = {
        inlineProviders: Array<{ identifier: string }>;
        registerInlineProvider: (provider: {
          identifier: string;
          name: string;
          fetch: (request: {
            text: string;
            offset: number;
          }) => Promise<{ items: Array<{ insertText: string }> }>;
        }) => void;
        inline?: {
          configure: (settings: {
            showWidget: string;
            showShortcuts: boolean;
            streamingAnimation: string;
            ghostSyntaxHighlighting: boolean;
            providers: Record<
              string,
              {
                enabled: boolean;
                timeout: number;
                debouncerDelay: number;
                autoFillInMiddle: boolean;
              }
            >;
            minLines: number;
            maxLines: number;
            editorResizeDelay: number;
            reserveSpaceForLongest: boolean;
            suppressIfTabCompleterActive: boolean;
          }) => void;
        };
      };

      const appRegistry = app as typeof app & RegistryLike;
      const registries = [appRegistry, appRegistry._pluginRegistry].filter(
        (value): value is RegistryLike => value !== undefined
      );
      let token: NamedToken | undefined;
      for (const registry of registries) {
        const serviceMap = registry._serviceMap;
        if (!serviceMap) {
          continue;
        }
        token = Array.from(serviceMap.keys()).find(
          candidate => candidate.name === managerTokenName
        );
        if (token) {
          break;
        }
      }
      if (!token) {
        throw new Error('Unable to resolve the JupyterLab completion manager');
      }

      const manager = (await app.resolveRequiredService(
        token as never
      )) as unknown as CompletionManagerLike;
      if (!manager.inline) {
        throw new Error('Native inline completer is unavailable');
      }

      const trackerToken = registries
        .flatMap(registry => Array.from(registry._serviceMap?.keys() ?? []))
        .find(candidate => candidate.name === '@jupyter/chat:IChatTracker');
      const commandsToken = registries
        .flatMap(registry => Array.from(registry._serviceMap?.keys() ?? []))
        .find(
          candidate => candidate.name === '@jupyter/chat:IChatCommandRegistry'
        );
      if (!trackerToken || !commandsToken) {
        throw new Error('The matching Jupyter Chat fork is required');
      }
      type InputLike = {
        value: string;
        currentWord: string | null;
        config: { sendWithShiftEnter?: boolean };
        focus: () => void;
      };
      const tracker = (await app.resolveRequiredService(
        trackerToken as never
      )) as unknown as {
        currentWidget: {
          model: { input: InputLike };
          dispose: () => void;
        } | null;
      };
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
      const registry = (await app.resolveRequiredService(
        commandsToken as never
      )) as unknown as {
        addProvider: (provider: {
          id: string;
          listCommandCompletions: (input: InputLike) => Promise<
            Array<{
              name: string;
              providerId: string;
              replaceWith: string;
              spaceOnAccept: boolean;
            }>
          >;
          onSubmit: () => Promise<void>;
        }) => void;
      };
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
        !manager.inlineProviders.some(
          provider => provider.identifier === providerId
        )
      ) {
        manager.registerInlineProvider({
          identifier: providerId,
          name: 'Deterministic chat test provider',
          fetch: async request => {
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

      manager.inline.configure({
        showWidget: 'onHover',
        showShortcuts: true,
        streamingAnimation: 'uncover',
        ghostSyntaxHighlighting: false,
        providers: {
          [providerId]: {
            enabled: true,
            timeout: 1000,
            debouncerDelay: 0,
            autoFillInMiddle: false
          }
        },
        minLines: 0,
        maxLines: 4,
        editorResizeDelay: 1000,
        reserveSpaceForLongest: false,
        suppressIfTabCompleterActive: true
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
    await messageEditor.press('Tab');
    await expect(ghost).toHaveCount(0);
    await expect(messageEditor).toHaveText('edit accepted');

    // Tab acceptance must not submit/update the message. Escape cancels editing,
    // and the surviving composer must become the native completion target again.
    await expect(page.locator('.jp-chat-message-container')).toHaveCount(1);
    await messageEditor.press('Escape');
    await expect(messageEditor).toHaveCount(0);
    await expect(message.locator('.jp-chat-rendered-markdown')).toContainText(
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
