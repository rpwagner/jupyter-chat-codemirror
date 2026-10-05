import { ChatInput, IChatInputFactory, IChatTracker } from '@jupyter/chat';
import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import { IEditorServices } from '@jupyterlab/codeeditor';
import { ICompletionProviderManager } from '@jupyterlab/completer';
import React from 'react';

import { ChatCodeMirrorInput } from './chat-codemirror';
import { ChatCompletionBinder } from './completion-binder';

const completionBinder = new ChatCompletionBinder();

/** Replace Jupyter Chat's composer and message editor with CodeMirror. */
const inputPlugin: JupyterFrontEndPlugin<IChatInputFactory> = {
  id: 'jupyter-chat-codemirror:plugin',
  description: 'A CodeMirror-backed input adapter for Jupyter Chat.',
  autoStart: true,
  requires: [IEditorServices],
  provides: IChatInputFactory,
  activate: (_app: JupyterFrontEnd, editorServices: IEditorServices) => ({
    create: (props: ChatInput.IProps) =>
      React.createElement(ChatCodeMirrorInput, {
        ...props,
        editorFactory: editorServices.factoryService.newInlineEditor,
        completionBinder
      })
  })
};

/** Attach tracked chat editors to JupyterLab's native completion manager. */
const completionPlugin: JupyterFrontEndPlugin<void> = {
  id: 'jupyter-chat-codemirror:completion',
  description: 'Connects chat CodeMirror editors to native completions.',
  autoStart: true,
  optional: [IChatTracker, ICompletionProviderManager],
  activate: (
    _app: JupyterFrontEnd,
    tracker: IChatTracker | null,
    manager: ICompletionProviderManager | null
  ) => {
    if (tracker) {
      completionBinder.configure(tracker, manager);
    }
  }
};

export default [inputPlugin, completionPlugin];
