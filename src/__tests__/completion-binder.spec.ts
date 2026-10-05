/*
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */

import { IChatPanel, IChatTracker } from '@jupyter/chat';
import { CodeEditor } from '@jupyterlab/codeeditor';
import { ICompletionProviderManager } from '@jupyterlab/completer';

import { ChatCompletionBinder } from '../completion-binder';

interface ITestSignal<T> {
  connect: (slot: (sender: T, args: void) => void) => void;
  disconnect: (slot: (sender: T, args: void) => void) => void;
  emit: () => void;
}

function createSignal<T>(sender: T): ITestSignal<T> {
  const slots = new Set<(sender: T, args: void) => void>();
  return {
    connect: slot => {
      slots.add(slot);
    },
    disconnect: slot => {
      slots.delete(slot);
    },
    emit: () => {
      slots.forEach(slot => slot(sender, undefined));
    }
  };
}

function createEditor(initialFocus: boolean): {
  editor: CodeEditor.IEditor;
  setFocus: (focused: boolean) => void;
  dispose: () => void;
} {
  const host = document.createElement('div');
  let focused = initialFocus;
  let disposed = false;
  const editor = {
    host,
    get isDisposed() {
      return disposed;
    },
    hasFocus: () => focused
  } as unknown as CodeEditor.IEditor;

  return {
    editor,
    setFocus: value => {
      focused = value;
    },
    dispose: () => {
      disposed = true;
    }
  };
}

function createHarness() {
  const model = {} as IChatPanel['model'];
  const area = 'main' as IChatPanel['area'];
  const disposed = createSignal<IChatPanel>(null as unknown as IChatPanel);
  const widget = {
    id: 'chat-panel',
    model,
    area,
    isDisposed: false,
    disposed
  } as unknown as IChatPanel;
  // The signal sender needs the completed widget.
  const widgetDisposed = createSignal(widget);
  Object.defineProperty(widget, 'disposed', { value: widgetDisposed });

  const currentChanged = createSignal<IChatTracker>(
    null as unknown as IChatTracker
  );
  const widgetAdded = createSignal<IChatTracker>(
    null as unknown as IChatTracker
  );
  const tracker = {
    currentWidget: widget,
    currentChanged,
    widgetAdded,
    find: (fn: (candidate: IChatPanel) => boolean) =>
      fn(widget) ? widget : null
  } as unknown as IChatTracker;

  const updateCompleter = jest.fn().mockResolvedValue(undefined);
  const manager = {
    updateCompleter
  } as unknown as ICompletionProviderManager;

  return { model, area, widget, tracker, manager, updateCompleter };
}

async function flushUpdates(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('ChatCompletionBinder', () => {
  it('binds the focused composer and rebinds through message editing', async () => {
    const { model, area, widget, tracker, manager, updateCompleter } =
      createHarness();
    const binder = new ChatCompletionBinder();
    const composer = createEditor(true);

    // Inputs can mount before IChatTracker is available because the tracker
    // itself depends on the chat factory that consumes IChatInputFactory.
    const releaseComposer = binder.register(composer.editor, model, area);
    expect(updateCompleter).not.toHaveBeenCalled();

    binder.configure(tracker, manager);
    await flushUpdates();
    expect(updateCompleter).toHaveBeenLastCalledWith({
      widget,
      editor: composer.editor
    });

    composer.setFocus(false);
    const edit = createEditor(true);
    const releaseEdit = binder.register(edit.editor, model, area);
    await flushUpdates();
    expect(updateCompleter).toHaveBeenLastCalledWith({
      widget,
      editor: edit.editor
    });

    // Closing the message editor must move the native handler back to the
    // existing composer before the edit editor can be disposed.
    await releaseEdit();
    edit.dispose();
    expect(updateCompleter).toHaveBeenLastCalledWith({
      widget,
      editor: composer.editor
    });
    expect(composer.editor.isDisposed).toBe(false);

    await releaseComposer();
  });

  it('keeps CodeMirror usable when the completion manager is unavailable', async () => {
    const { model, area, tracker } = createHarness();
    const binder = new ChatCompletionBinder();
    const composer = createEditor(true);

    binder.configure(tracker, null);
    const release = binder.register(composer.editor, model, area);
    await expect(release()).resolves.toBeUndefined();
  });
});
