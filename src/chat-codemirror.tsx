import {
  autocompletion,
  completionStatus,
  CompletionContext,
  CompletionResult
} from '@codemirror/autocomplete';
import { Compartment, Prec } from '@codemirror/state';
import { EditorView, placeholder } from '@codemirror/view';
import {
  ChatCommand,
  ChatInput,
  IInputModel,
  InputModel,
  useChatContext,
  useTranslator
} from '@jupyter/chat';
import { Notification } from '@jupyterlab/apputils';
import { CodeEditor } from '@jupyterlab/codeeditor';
import { CodeMirrorEditor } from '@jupyterlab/codemirror';
import React, { useEffect, useRef } from 'react';

import { ChatCompletionBinder } from './completion-binder';

/** The props supplied by the chat input factory. */
export interface IChatCodeMirrorProps extends ChatInput.IProps {
  /** JupyterLab's configured editor factory. */
  editorFactory: CodeEditor.Factory;
  /** Shared lifecycle bridge to JupyterLab's native completion manager. */
  completionBinder: ChatCompletionBinder;
}

/** A CodeMirror chat input, hosted inside Jupyter Chat's existing composer. */
export function ChatCodeMirrorInput(props: IChatCodeMirrorProps): JSX.Element {
  const { model, editorFactory, completionBinder } = props;
  const { area, chatCommandRegistry, model: chatModel } = useChatContext();
  const trans = useTranslator();
  const hostRef = useRef<HTMLDivElement>(null);
  const onCancelRef = useRef(props.onCancel);
  const editRef = useRef(props.edit);
  const translatorRef = useRef(trans);
  onCancelRef.current = props.onCancel;
  editRef.current = props.edit;
  translatorRef.current = trans;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    const editorModel = new CodeEditor.Model({ mimeType: 'text/x-markdown' });
    editorModel.sharedModel.setSource(model.value);
    const placeholderSlot = new Compartment();
    let sending = false;
    let disposed = false;

    /** Send through the same command preprocessing used by the stock input. */
    async function send(): Promise<void> {
      if (sending || (!model.value.trim() && !model.attachments.length)) {
        return;
      }
      sending = true;
      try {
        await chatCommandRegistry?.onSubmit(model);
        if (!disposed) {
          model.send(model.value);
          model.focus();
        }
      } catch (error) {
        console.error('Unable to submit the chat message', error);
        Notification.error(
          translatorRef.current.__('Unable to send the chat message.')
        );
      } finally {
        sending = false;
      }
    }

    /** Expose existing slash, mention, and other command providers to CodeMirror. */
    async function commandCompletions(
      context: CompletionContext
    ): Promise<CompletionResult | null> {
      const word = context.matchBefore(/[^\s]+$/);
      if (!word || !word.text || !chatCommandRegistry) {
        return null;
      }

      const commands: ChatCommand[] = [];
      for (const provider of chatCommandRegistry.getProviders()) {
        try {
          commands.push(...(await provider.listCommandCompletions(model)));
        } catch (error) {
          console.error(
            `Unable to retrieve chat commands from ${provider.id}`,
            error
          );
        }
        if (context.aborted) {
          return null;
        }
      }

      if (!commands.length) {
        return null;
      }
      const single = commands.length === 1 ? commands[0] : undefined;
      if (
        single?.name === word.text &&
        single.replaceWith !== undefined &&
        single.replaceWith !== word.text &&
        context.view
      ) {
        const view = context.view;
        const replacement = single.replaceWith;
        queueMicrotask(() => {
          if (
            !disposed &&
            !context.aborted &&
            view.state.selection.main.head === word.to &&
            view.state.doc.sliceString(word.from, word.to) === word.text
          ) {
            view.dispatch({
              changes: {
                from: word.from,
                to: word.to,
                insert: replacement
              },
              selection: { anchor: word.from + replacement.length }
            });
          }
        });
        return null;
      }
      return {
        from: word.from,
        filter: false,
        options: commands.map(command => ({
          label: command.name,
          detail: command.description,
          apply: (
            view: EditorView,
            _completion: unknown,
            from: number,
            to: number
          ) => {
            const replacement =
              (command.replaceWith ?? command.name) +
              (command.spaceOnAccept ? ' ' : '');
            view.dispatch({
              changes: { from, to, insert: replacement },
              selection: { anchor: from + replacement.length }
            });
          }
        }))
      };
    }

    /** Keep the chat model and its cursor in step with CodeMirror. */
    const onEditorUpdate = EditorView.updateListener.of(update => {
      if (update.docChanged) {
        model.value = update.state.doc.toString();
      }
      if (update.docChanged || update.selectionSet) {
        model.cursorIndex = update.state.selection.main.head;
      }
    });

    const onKeyDown = Prec.high(
      EditorView.domEventHandlers({
        keydown: (event, view) => {
          if (
            event.key === 'Escape' &&
            editRef.current &&
            onCancelRef.current
          ) {
            if (completionStatus(view.state)) {
              return false;
            }
            onCancelRef.current();
            event.preventDefault();
            return true;
          }
          if (event.key !== 'Enter' || completionStatus(view.state)) {
            return false;
          }
          const sendWithShiftEnter = model.config.sendWithShiftEnter ?? false;
          const isSend = sendWithShiftEnter ? event.shiftKey : !event.shiftKey;
          if (isSend) {
            void send();
            event.preventDefault();
            return true;
          }
          if (!model.value.trim() && !model.attachments.length) {
            event.preventDefault();
            return true;
          }
          return false;
        }
      })
    );

    const inputPlaceholder = () =>
      model.config.inputPlaceholder ??
      translatorRef.current.__('Type a chat message, @ to mention...');

    const createdEditor = editorFactory({
      host,
      model: editorModel,
      extensions: [
        EditorView.lineWrapping,
        EditorView.contentAttributes.of({
          'aria-label': translatorRef.current.__('Chat message')
        }),
        placeholderSlot.of(placeholder(inputPlaceholder())),
        autocompletion({ override: [commandCompletions] }),
        onEditorUpdate,
        onKeyDown
      ]
    });
    if (!(createdEditor instanceof CodeMirrorEditor)) {
      createdEditor.dispose();
      editorModel.dispose();
      throw new Error('The configured editor service must provide CodeMirror');
    }
    const editor: CodeMirrorEditor = createdEditor;

    const onValueChanged = (_: IInputModel, value: string) => {
      if (editorModel.sharedModel.source !== value) {
        editorModel.sharedModel.setSource(value);
      }
    };
    const onConfigChanged = (_: IInputModel, _config: InputModel.IConfig) => {
      editor.editor.dispatch({
        effects: placeholderSlot.reconfigure(placeholder(inputPlaceholder()))
      });
    };
    const onFocusRequested = () => editor.focus();

    model.valueChanged.connect(onValueChanged);
    model.configChanged.connect(onConfigChanged);
    model.focusInputSignal?.connect(onFocusRequested);

    const releaseCompletion = completionBinder.register(
      editor,
      chatModel,
      area
    );
    editor.focus();

    return () => {
      disposed = true;
      model.valueChanged.disconnect(onValueChanged);
      model.configChanged.disconnect(onConfigChanged);
      model.focusInputSignal?.disconnect(onFocusRequested);

      const disposeEditor = () => {
        editor.dispose();
        editorModel.dispose();
      };
      void releaseCompletion().then(disposeEditor, error => {
        console.error('Unable to release chat completion binding', error);
        disposeEditor();
      });
    };
  }, [
    model,
    editorFactory,
    completionBinder,
    chatCommandRegistry,
    chatModel,
    area
  ]);

  return <div className="jp-jupyter-chat-codemirror-input" ref={hostRef} />;
}
