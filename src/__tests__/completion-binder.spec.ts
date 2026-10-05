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

function createHarness(area: IChatPanel['area'] = 'main', id = 'chat-panel') {
  const model = {} as IChatPanel['model'];
  let widgetIsDisposed = false;
  const widget = {
    id,
    model,
    area,
    get isDisposed() {
      return widgetIsDisposed;
    }
  } as unknown as IChatPanel;
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

  const disposeWidget = () => {
    widgetIsDisposed = true;
    widgetDisposed.emit();
  };

  return {
    model,
    area,
    widget,
    tracker,
    manager,
    updateCompleter,
    disposeWidget
  };
}

async function flushUpdates(): Promise<void> {
  for (let index = 0; index < 8; index++) {
    await Promise.resolve();
  }
}

describe('ChatCompletionBinder', () => {
  it('binds the focused composer and rebinds through message editing', async () => {
    const {
      model,
      area,
      widget,
      tracker,
      manager,
      updateCompleter,
      disposeWidget
    } = createHarness();
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

    const releasePromise = releaseComposer();
    await Promise.resolve();
    disposeWidget();
    await releasePromise;
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

describe('native completion context safety', () => {
  it('resolves an omitted area through the public model identity', async () => {
    const { model, widget, tracker, manager, updateCompleter } =
      createHarness('sidebar');
    const binder = new ChatCompletionBinder();
    binder.configure(tracker, manager);
    const input = createEditor(true);
    binder.register(input.editor, model, undefined);
    await flushUpdates();
    expect(updateCompleter).toHaveBeenLastCalledWith({
      widget,
      editor: input.editor
    });
  });

  it('accepts native inline text only for the live focused bound editor', async () => {
    const { model, area, widget, tracker, manager } = createHarness('sidebar');
    const accept = jest.fn();
    const isActive = jest.fn().mockReturnValue(true);
    manager.inline = { accept, isActive } as NonNullable<typeof manager.inline>;
    const binder = new ChatCompletionBinder();
    binder.configure(tracker, manager);
    const input = createEditor(true);
    binder.register(input.editor, model, area);
    expect(binder.acceptInline(input.editor)).toBe(false);
    await flushUpdates();
    expect(binder.acceptInline(input.editor)).toBe(true);
    expect(accept).toHaveBeenCalledWith(widget.id);
    input.setFocus(false);
    expect(binder.acceptInline(input.editor)).toBe(false);
    input.setFocus(true);
    isActive.mockReturnValue(false);
    expect(binder.acceptInline(input.editor)).toBe(false);
    input.dispose();
    expect(binder.acceptInline(input.editor)).toBe(false);
    expect(accept).toHaveBeenCalledTimes(1);
  });

  it('retains an inactive panel editor until that panel handler is disposed', async () => {
    const first = createHarness('main', 'first');
    const second = createHarness('sidebar', 'second');
    const tracker = {
      ...first.tracker,
      find: (fn: (widget: IChatPanel) => boolean) =>
        [first.widget, second.widget].find(fn) ?? null
    } as IChatTracker;
    const binder = new ChatCompletionBinder();
    binder.configure(tracker, first.manager);
    const firstInput = createEditor(true);
    const releaseFirst = binder.register(
      firstInput.editor,
      first.model,
      first.area
    );
    await flushUpdates();
    firstInput.setFocus(false);
    const secondInput = createEditor(true);
    binder.register(secondInput.editor, second.model, second.area);
    await flushUpdates();
    expect(first.updateCompleter).toHaveBeenLastCalledWith({
      widget: second.widget,
      editor: secondInput.editor
    });
    let released = false;
    const release = releaseFirst().then(() => {
      released = true;
    });
    await flushUpdates();
    expect(released).toBe(false);
    first.disposeWidget();
    await release;
    expect(released).toBe(true);
    expect(secondInput.editor.isDisposed).toBe(false);
  });

  it('waits for an in-flight bind before handing off editor disposal', async () => {
    const {
      model,
      area,
      widget,
      tracker,
      manager,
      updateCompleter,
      disposeWidget
    } = createHarness();
    let completeUpdate: () => void = () => undefined;
    updateCompleter.mockImplementationOnce(
      () =>
        new Promise<void>(resolve => {
          completeUpdate = resolve;
        })
    );
    const binder = new ChatCompletionBinder();
    binder.configure(tracker, manager);
    const oldInput = createEditor(true);
    const releaseOld = binder.register(oldInput.editor, model, area);
    await flushUpdates();
    oldInput.setFocus(false);
    let released = false;
    const release = releaseOld().then(() => {
      released = true;
    });
    const replacement = createEditor(true);
    binder.register(replacement.editor, model, area);
    await flushUpdates();
    expect(released).toBe(false);
    completeUpdate();
    await release;
    expect(updateCompleter).toHaveBeenLastCalledWith({
      widget,
      editor: replacement.editor
    });
    expect(released).toBe(true);
    disposeWidget();
  });

  it('keeps the previous editor alive when rebinding fails', async () => {
    const { model, area, tracker, manager, updateCompleter, disposeWidget } =
      createHarness();
    const error = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const binder = new ChatCompletionBinder();
    binder.configure(tracker, manager);
    const composer = createEditor(true);
    binder.register(composer.editor, model, area);
    await flushUpdates();
    composer.setFocus(false);
    const edit = createEditor(true);
    const releaseEdit = binder.register(edit.editor, model, area);
    await flushUpdates();
    updateCompleter.mockRejectedValueOnce(new Error('native update failed'));
    let released = false;
    const release = releaseEdit().then(() => {
      released = true;
    });
    await flushUpdates();
    expect(error).toHaveBeenCalled();
    expect(released).toBe(false);
    expect(edit.editor.isDisposed).toBe(false);
    disposeWidget();
    await release;
    error.mockRestore();
  });
});
