/*
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */

import { IChatPanel, IChatTracker } from '@jupyter/chat';
import { CodeEditor } from '@jupyterlab/codeeditor';
import { ICompletionProviderManager } from '@jupyterlab/completer';

interface IEditorBinding {
  editor: CodeEditor.IEditor;
  model: IChatPanel['model'];
  area: IChatPanel['area'] | undefined;
  widget: IChatPanel | null;
  focusOrder: number;
  released: boolean;
}

interface IReleaseWaiter {
  binding: IEditorBinding;
  resolve: () => void;
}

/** Connect real tracked chat panels/editors to the native completion manager. */
export class ChatCompletionBinder {
  /** Wire completion services after the tracker has consumed the input factory. */
  configure(
    tracker: IChatTracker,
    manager: ICompletionProviderManager | null
  ): void {
    if (this._tracker === tracker && this._manager === manager) {
      return;
    }
    this._tracker?.currentChanged.disconnect(this._onTrackerChanged);
    this._tracker?.widgetAdded.disconnect(this._onTrackerChanged);
    this._tracker = tracker;
    this._manager = manager;
    tracker.currentChanged.connect(this._onTrackerChanged);
    tracker.widgetAdded.connect(this._onTrackerChanged);
    this._onTrackerChanged();
  }

  /** Register an input; release it only after its native handler has moved. */
  register(
    editor: CodeEditor.IEditor,
    model: IChatPanel['model'],
    area: IChatPanel['area'] | undefined
  ): () => Promise<void> {
    const binding: IEditorBinding = {
      editor,
      model,
      area,
      widget: this._findWidget(model, area),
      focusOrder: 0,
      released: false
    };
    this._bindings.set(editor, binding);
    const onFocus = () => this._activate(binding);
    editor.host.addEventListener('focusin', onFocus);
    if (editor.hasFocus()) {
      this._activate(binding);
    }
    return async () => {
      editor.host.removeEventListener('focusin', onFocus);
      await this._release(binding);
    };
  }

  /**
   * Accept through the public native action for this exact editor/panel.
   * JupyterLab's global command targets the main-area shell widget, so a chat
   * in the sidebar needs this small input-local Tab bridge. Rendering, fetching
   * and insertion still belong entirely to the native completer.
   */
  acceptInline(editor: CodeEditor.IEditor): boolean {
    const binding = this._bindings.get(editor);
    const widget = binding?.widget;
    const inline = this._manager?.inline;
    if (
      !binding ||
      binding.released ||
      editor.isDisposed ||
      !editor.hasFocus() ||
      !widget ||
      widget.isDisposed ||
      this._bound.get(widget) !== binding ||
      !inline?.isActive(widget.id)
    ) {
      return false;
    }
    inline.accept(widget.id);
    return true;
  }

  private _activate(binding: IEditorBinding): void {
    if (binding.released || binding.editor.isDisposed) {
      return;
    }
    const widget = this._findWidget(binding.model, binding.area);
    if (!widget) {
      return;
    }
    binding.widget = widget;
    binding.focusOrder = ++this._focusOrder;
    void this._queueUpdate(binding, widget);
  }

  private _onTrackerChanged = (): void => {
    for (const binding of this._bindings.values()) {
      binding.widget = this._findWidget(binding.model, binding.area);
      if (binding.editor.hasFocus()) {
        this._activate(binding);
      }
    }
  };

  private _findWidget(
    model: IChatPanel['model'],
    area: IChatPanel['area'] | undefined
  ): IChatPanel | null {
    return (
      this._tracker?.find(
        widget =>
          !widget.isDisposed &&
          widget.model === model &&
          (area === undefined || widget.area === area)
      ) ?? null
    );
  }

  private _queueUpdate(
    binding: IEditorBinding,
    widget: IChatPanel
  ): Promise<void> {
    const manager = this._manager;
    if (!manager) {
      return Promise.resolve();
    }
    // The native manager owns one handler per panel, including inactive panels.
    // Keep desired and successfully installed targets per panel as well.
    this._targets.set(widget, binding);
    this._pending = this._pending
      .then(async () => {
        if (
          manager !== this._manager ||
          binding.released ||
          binding.editor.isDisposed ||
          widget.isDisposed ||
          this._targets.get(widget) !== binding
        ) {
          return;
        }
        await manager.updateCompleter({ widget, editor: binding.editor });
        if (widget.isDisposed) {
          this._targets.delete(widget);
          this._bound.delete(widget);
        } else {
          this._bound.set(widget, binding);
        }
        this._resolveReleaseWaiters(widget);
      })
      .catch(reason => {
        // A failed rebind must not release the editor still used by the handler.
        console.error(
          'Failed to bind chat editor to completion manager',
          reason
        );
      });
    return this._pending;
  }

  private async _release(binding: IEditorBinding): Promise<void> {
    if (binding.released) {
      return;
    }
    binding.released = true;
    this._bindings.delete(binding.editor);
    const widget = binding.widget;
    if (!widget || !this._manager) {
      return;
    }
    if (this._targets.get(widget) === binding) {
      this._targets.delete(widget);
      // React can register a replacement during the same commit.
      await Promise.resolve();
      const replacement = this._findReplacement(widget);
      if (replacement) {
        await this._queueUpdate(replacement, widget);
      }
    }
    // An in-flight update may have already captured this editor. Wait for it,
    // including any subsequent replacement, before considering disposal safe.
    await this._pending;
    if (widget.isDisposed) {
      this._targets.delete(widget);
      this._bound.delete(widget);
      this._resolveReleaseWaiters(widget);
      return;
    }
    if (this._bound.get(widget) !== binding) {
      return;
    }
    await new Promise<void>(resolve => {
      const onDisposed = () => {
        this._targets.delete(widget);
        this._bound.delete(widget);
        this._resolveReleaseWaiters(widget);
      };
      const waiter: IReleaseWaiter = {
        binding,
        resolve: () => {
          widget.disposed.disconnect(onDisposed);
          resolve();
        }
      };
      widget.disposed.connect(onDisposed);
      const waiters = this._releaseWaiters.get(widget) ?? new Set();
      waiters.add(waiter);
      this._releaseWaiters.set(widget, waiters);
    });
  }

  private _findReplacement(widget: IChatPanel): IEditorBinding | null {
    return (
      Array.from(this._bindings.values())
        .filter(candidate => {
          candidate.widget = this._findWidget(candidate.model, candidate.area);
          return !candidate.editor.isDisposed && candidate.widget === widget;
        })
        .sort((left, right) => {
          const focusDelta =
            Number(right.editor.hasFocus()) - Number(left.editor.hasFocus());
          return focusDelta || right.focusOrder - left.focusOrder;
        })[0] ?? null
    );
  }

  private _resolveReleaseWaiters(widget: IChatPanel): void {
    const waiters = this._releaseWaiters.get(widget);
    if (!waiters) {
      return;
    }
    for (const waiter of waiters) {
      if (widget.isDisposed || this._bound.get(widget) !== waiter.binding) {
        waiters.delete(waiter);
        waiter.resolve();
      }
    }
    if (!waiters.size) {
      this._releaseWaiters.delete(widget);
    }
  }

  private _tracker: IChatTracker | null = null;
  private _manager: ICompletionProviderManager | null = null;
  private _bindings = new Map<CodeEditor.IEditor, IEditorBinding>();
  private _targets = new Map<IChatPanel, IEditorBinding>();
  private _bound = new Map<IChatPanel, IEditorBinding>();
  private _releaseWaiters = new Map<IChatPanel, Set<IReleaseWaiter>>();
  private _focusOrder = 0;
  private _pending: Promise<void> = Promise.resolve();
}
