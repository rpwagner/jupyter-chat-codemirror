import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';

/**
 * Initialization data for the jupyter-chat-codemirror extension.
 */
const plugin: JupyterFrontEndPlugin<void> = {
  id: 'jupyter-chat-codemirror:plugin',
  description: 'A CodeMirror-backed input adapter for Jupyter Chat.',
  autoStart: true,
  activate: (app: JupyterFrontEnd) => {
    console.log('JupyterLab extension jupyter-chat-codemirror is activated!');
  }
};

export default plugin;
