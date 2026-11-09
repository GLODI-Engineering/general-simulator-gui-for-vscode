/**
 * Message protocol between the General Simulator webviews and the VS Code
 * extension host.
 *
 * The declaration lives in `@gensim/webview-protocol` and is re-exported here
 * so that every existing `../ipc/vscode-protocol` import keeps working. It used
 * to be a second copy of the same shapes, kept in sync by hand — see that
 * package's own header for why the duplication existed and what removed it.
 */

export type {
  HostBoundMessage,
  KernelConfig,
  WebviewBoundMessage,
  WebviewInit,
  WebviewRole,
} from "@gensim/webview-protocol";
export { GSIM_INIT_GLOBAL, isHostBoundMessage } from "@gensim/webview-protocol";
