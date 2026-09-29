# jupyter-chat-codemirror

A CodeMirror input for the Jupyter Chat composer and message editor. It replaces
the text field through `IChatInputFactory` in
[rpwagner/jupyter-chat](https://github.com/rpwagner/jupyter-chat), while Jupyter
Chat continues to own the attachment preview, toolbar, and message model.

The adapter currently supports multiline input, the configured Enter or
Shift+Enter send shortcut, Escape to cancel editing, focus requests, and the
existing chat command providers (`/`, `@`, and any other registered providers).
The command list is deterministic and does not call an LLM. Inline generated
text is a separate follow-up for `jupyter-chat-completions`.

## Dependency decision

- **Capability:** embed an editor and show Jupyter Chat's command suggestions.
- **Existing solution:** JupyterLab's `IEditorServices` supplies CodeMirror;
  Jupyter Chat supplies the input model and command providers.
- **Direct dependencies:** `@jupyter/chat`, `@jupyterlab/codeeditor`,
  `@jupyterlab/codemirror`, React, and the CodeMirror state, view, and
  autocomplete APIs already used by JupyterLab.
- **Alternative:** write a separate text editor and popup. That would duplicate
  cursor handling, keyboard navigation, accessibility, and popup behavior.
- **Decision:** reuse the host's CodeMirror stack and keep only the model
  adapter here. This adds no model service or network request. The material
  integration risk is the fork-only factory API described below.

## Fork dependency

The public `@jupyter/chat@0.25.1` does not export `IChatInputFactory`. This
private extension pins a commit of [rpwagner/jupyter-chat](https://github.com/rpwagner/jupyter-chat)
as a Yarn Git workspace dependency. That workspace builds its JS and type
declarations during packing; no public npm release is required. The pinned
commit includes the input factory and the package preparation hook. A Git
source install takes longer than the registry install.

JupyterLab shares the adapter's bundled `@jupyter/chat` module as a singleton
so the fork's chat extension and this factory provider use the same token.
Install the fork's JupyterLab chat extension in the same environment to show
the chat interface. Follow [CONTRIBUTING.md](CONTRIBUTING.md) and `AGENTS.md`
to build and install this extension in an activated environment, then verify
command selection, sending, attachments, and message editing in a running
JupyterLab.
