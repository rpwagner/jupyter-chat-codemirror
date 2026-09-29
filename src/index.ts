import { IChatInputFactory } from '@jupyter/chat';
import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import { IEditorServices } from '@jupyterlab/codeeditor';
import React from 'react';

import { ChatCodeMirrorInput } from './chat-codemirror';

/** Replace Jupyter Chat's composer and message editor with CodeMirror. */
const plugin: JupyterFrontEndPlugin<IChatInputFactory> = {
  id: 'jupyter-chat-codemirror:plugin',
  description: 'A CodeMirror-backed input adapter for Jupyter Chat.',
  autoStart: true,
  requires: [IEditorServices],
  provides: IChatInputFactory,
  activate: (_app: JupyterFrontEnd, editorServices: IEditorServices) => ({
    create: props =>
      React.createElement(ChatCodeMirrorInput, {
        ...props,
        editorFactory: editorServices.factoryService.newInlineEditor
      })
  })
};

export default plugin;
