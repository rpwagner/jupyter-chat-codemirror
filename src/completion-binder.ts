/*
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */

import { IChatPanel, IChatTracker } from '@jupyter/chat';
import { CodeEditor } from '@jupyterlab/codeeditor';
import { ICompletionProviderManager } from '@jupyterlab/completer';

interface IEditorBinding {
  editor: CodeEditor.IEditor;
  widget: IChatPanel | null;
  focusOrder: number;
  released: boolean;
}

interface IReleaseWaiter {
  widget: IChatPanel;
  resolve: () => void;
  onDisposed: () => void;
}

/**
 * Binds live chat editors to JupyterLab's native completion manager.
 *
 * The chat input factory is required while the chat tracker is being created,
 * so completion services are configured separately after the tracker exists.
 * This binder keeps that late wiring provider-neutral while still handing the
 * manager the real tracked chat panel and the real CodeMirror editor.
 */
export class ChatCompletionBinder {
  /**
   * Configure the public chat tracker and optional completion manager.
   */
  configure(
    tracker: IChatTracker,
    manager: ICompletionProviderManager | null
  ): void {
    if (this._tracker === tracker && this._manager === manager) {
      return;
    }

    this._tracker?.currentChanged.disconnect(this._onCurrentChanged, this);
    this._tracker = tracker;
    this._manager = manager;
    tracker.currentChanged.connect(this._onCurrentChanged, this);

    this._rebindFocusedEditor();
  }

  /**
   * Register an editor and return an async release callback.
   *
   * Release waits for a live editor in the same chat to replace the active
   * completion context, or for the chat panel itself to be disposed. This
   * prevents the native manager from retaining a disposed editor.
   */
  register(editor: CodeEditor.IEditor): () => Promise<void> {
    const binding: IEditorBinding = {
      editor,
      widget: null,
      focusOrder: 0,
      released: false
    };
    this._bindings.set(editor, binding);

    const onFocus = () => {
      this._activate(binding);
    };
    editor.host.addEventListener('focusin', onFocus);

    if (editor.hasFocus()) {
      this._activate(binding);
    }

    return async () => {
      editor.host.removeEventListener('focusin', onFocus);
      await this._release(binding);
    };
  }

  private _activate(binding: IEditorBinding): void {
    if (binding.released || binding.editor.isDisposed) {
      return;
    }

    const widget = this._tracker?.currentWidget ?? null;
    if (!widget || widget.isDisposed) {
      return;
    }

    binding.widget = widget;
    binding.focusOrder = ++this._focusOrder;
    this._active = binding;

    void this._queueUpdate(binding, widget).then(() => {
      this._resolveReleaseWaiters(widget);
    });
  }

  private _onCurrentChanged(): void {
    this._rebindFocusedEditor();
  }

  private _rebindFocusedEditor(): void {
    const focused = Array.from(this._bindings.values())
      .filter(
        binding =>
          !binding.released &&
          !binding.editor.isDisposed &&
          binding.editor.hasFocus()
      )
      .sort((left, right) => right.focusOrder - left.focusOrder)[0];

    if (focused) {
      this._activate(focused);
    }
  }

  private _queueUpdate(
    binding: IEditorBinding,
    widget: IChatPanel
  ): Promise<void> {
    const manager = this._manager;
    if (!manager) {
      return Promise.resolve();
    }

    const generation = ++this._generation;
    const update = this._pending.then(async () => {
      if (
        binding.released ||
        binding.editor.isDisposed ||
        widget.isDisposed ||
        binding.widget !== widget
      ) {
        return;
      }

      if (
        generation !== this._generation &&
        this._active !== binding
      ) {
        return;
      }

      await manager.updateCompleter({
        widget,
        editor: binding.editor
      });
    });

    const safeUpdate = update.catch(reason => {
      console.error('Failed to bind chat editor to completion manager', reason);
    });
    this._pending = safeUpdate;
    return safeUpdate;
  }

  private async _release(binding: IEditorBinding): Promise<void> {
    if (binding.released) {
      return;
    }

    binding.released = true;
    this._bindings.delete(binding.editor);

    const widget = binding.widget;
    if (!widget || this._active !== binding || !this._manager) {
      return;
    }

    this._active = null;

    // React may replace an editor in the same commit. Defer one microtask so
    // the replacement has a chance to register before choosing a fallback.
    await Promise.resolve();

    const replacement = this._findReplacement(widget);
    if (replacement) {
      this._active = replacement;
      await this._queueUpdate(replacement, widget);
      this._resolveReleaseWaiters(widget);
      return;
    }

    if (widget.isDisposed) {
      return;
    }

    await new Promise<void>(resolve => {
      const onDisposed = () => {
        this._removeReleaseWaiter(widget, waiter);
        resolve();
      };
      const waiter: IReleaseWaiter = {
        widget,
        resolve: () => {
          widget.disposed.disconnect(onDisposed);
          resolve();
        },
        onDisposed
      };

      widget.disposed.connect(onDisposed);
      const waiters = this._releaseWaiters.get(widget.id) ?? new Set();
      waiters.add(waiter);
      this._releaseWaiters.set(widget.id, waiters);
    });
  }

  private _findReplacement(widget: IChatPanel): IEditorBinding | null {
    return (
      Array.from(this._bindings.values())
        .filter(
          candidate =>
            !candidate.released &&
            !candidate.editor.isDisposed &&
            candidate.widget === widget
        )
        .sort((left, right) => right.focusOrder - left.focusOrder)[0] ?? null
    );
  }

  private _resolveReleaseWaiters(widget: IChatPanel): void {
    const waiters = this._releaseWaiters.get(widget.id);
    if (!waiters) {
      return;
    }

    this._releaseWaiters.delete(widget.id);
    waiters.forEach(waiter => waiter.resolve());
  }

  private _removeReleaseWaiter(
    widget: IChatPanel,
    waiter: IReleaseWaiter
  ): void {
    const waiters = this._releaseWaiters.get(widget.id);
    if (!waiters) {
      return;
    }

    waiters.delete(waiter);
    if (waiters.size === 0) {
      this._releaseWaiters.delete(widget.id);
    }
  }

  private _tracker: IChatTracker | null = null;
  private _manager: ICompletionProviderManager | null = null;
  private _bindings = new Map<CodeEditor.IEditor, IEditorBinding>();
  private _releaseWaiters = new Map<string, Set<IReleaseWaiter>>();
  private _active: IEditorBinding | null = null;
  private _focusOrder = 0;
  private _generation = 0;
  private _pending: Promise<void> = Promise.resolve();
}
