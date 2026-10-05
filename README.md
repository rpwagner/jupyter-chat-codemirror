# jupyter-chat-codemirror

A CodeMirror input for the Jupyter Chat composer and message editor. It replaces
the text field through `IChatInputFactory` in
[rpwagner/jupyter-chat](https://github.com/rpwagner/jupyter-chat), while Jupyter
Chat continues to own the attachment preview, toolbar, and message model.

The adapter currently supports multiline input, the configured Enter or
Shift+Enter send shortcut, Escape to cancel editing, focus requests, and the
existing chat command providers (`/`, `@`, and any other registered providers).
The command list is deterministic and does not call an LLM. The adapter also
connects the focused composer or message editor to JupyterLab's native inline
completion manager using its real tracked chat panel and CodeMirror editor.
Standard `IInlineCompletionProvider` implementations can supply ghost text;
this package supplies no production suggestion provider or model transport.

Tab accepts a native inline suggestion into the draft without sending it. The
input delegates to the native accept action using the owning panel ID, including
sidebar chats where JupyterLab's global command targets the main-area widget.
The deterministic command popup keeps its own navigation and acceptance.
Completion handlers follow editor replacement and are retained safely until a
surviving editor takes over or their panel is disposed. Each panel has its own
binding, including panels that are no longer focused.

The completion services are optional. With the completer extension disabled,
the adapter remains a normal CodeMirror chat input. Installing it alone does
not send draft text anywhere; an independently installed and enabled native
provider owns suggestion requests.

## Dependency decision

- **Capability:** embed an editor and show Jupyter Chat's command suggestions.
- **Existing solution:** JupyterLab's `IEditorServices` supplies CodeMirror;
  Jupyter Chat supplies the input model and command providers.
- **Direct dependencies:** `@jupyter/chat`, `@jupyterlab/codeeditor`,
  `@jupyterlab/codemirror`, `@jupyterlab/completer`, React, and the CodeMirror state, view, and
  autocomplete APIs already used by JupyterLab.
- **Alternative:** write a separate text editor and popup. That would duplicate
  cursor handling, keyboard navigation, accessibility, and popup behavior.
- **Decision:** reuse the host's CodeMirror stack and keep only the model
  adapter here. Reuse the public completion manager and native renderer rather
  than implement a second completion stack. The small lifecycle and Tab bridge
  fills chat editor replacement and sidebar command-routing gaps. This adds no
  model service or network request. The material
  integration risk is the fork-only factory API described below.

## Fork dependency

The public `@jupyter/chat@0.25.1` does not export `IChatInputFactory`. This
private extension pins a commit of [rpwagner/jupyter-chat](https://github.com/rpwagner/jupyter-chat)
as a Yarn Git workspace dependency. That workspace builds its JS and type
declarations during packing; no public npm release is required. The pinned
commit `e567ade971fcdbde28e45b975be200020fe00099` synchronizes upstream
main `840493ee977bf28963146258e8490c5bb2ca8886` and preserves the input factory
and package preparation hook. Version 0.1.1 identifies the rebuilt private
artifact; version 0.1.0 remains the compatible recovery input. A Git
source install takes longer than the registry install.

JupyterLab shares the adapter's bundled `@jupyter/chat` module as a singleton
so the fork's chat extension and this factory provider use the same token.
Install the fork's JupyterLab chat extension in the same environment to show
the chat interface. Follow [CONTRIBUTING.md](CONTRIBUTING.md) and `AGENTS.md`
to build and install this extension in an activated environment, then verify
command selection, sending, attachments, and message editing in a running
JupyterLab.
