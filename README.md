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

## Development prerequisite

This extension uses `IChatInputFactory` from the **rpwagner/jupyter-chat fork**.
The upstream `@jupyter/chat` package at version 0.25.1 does not export that
token yet. Build and link `packages/jupyter-chat` from the fork in the same
activated JupyterLab development environment before building this extension;
install the fork's JupyterLab chat extension as well. A registry-only install
of `@jupyter/chat` will not build this adapter until the factory API is
published. This repository remains private and is not configured for public
package publication.

With the fork available locally, follow [CONTRIBUTING.md](CONTRIBUTING.md) and
`AGENTS.md` to install dependencies, build, and install the extension in the
activated environment. Open a chat and verify command selection, sending,
attachments, and editing an existing message. The source package needs to be
shared as one instance with the chat extension so both plugins use the same
factory token.
