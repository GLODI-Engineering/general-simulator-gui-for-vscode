/**
 * VS Code's default keybindings, as far as they collide with this extension's.
 *
 * Source: https://code.visualstudio.com/docs/reference/default-keybindings (Linux/Windows
 * column), read 2026-11-09. Not exhaustive — VS Code's full default keymap is several hundred
 * entries, registered in code rather than published as data, and most of them are editor
 * chords a schematic has no opinion about. What is here is every default whose chord the
 * schematic also binds, which is the set that actually decides who wins a keystroke.
 *
 * Kept as data so the conflict list is generated rather than written: a chord added to the
 * schematic's keymap shows up in the list on the next build, and `keybinding-conflicts.test.ts`
 * fails when the published list and the keymap disagree.
 */
export interface VsCodeDefault {
  chord: string;
  command: string;
  /** What VS Code does with it, in the words of its own documentation. */
  does: string;
  /**
   * Whether the binding fires while a webview has focus.
   *
   * This is the distinction that decides whether a conflict is real. VS Code's editor commands
   * carry a focus condition — `editorTextFocus` and relatives — so with a schematic focused
   * they do not fire at all and the keystroke reaches the canvas untouched. Its workbench
   * commands have no such condition: `Ctrl+R` opens the recent-files picker whatever is
   * focused, which is what a user reported as rotation not working.
   *
   * Only `workbench` conflicts are worth claiming, and claiming the others would do harm:
   * a contributed binding takes the keystroke from whatever has focus inside the webview, so
   * claiming `Home` or `Ctrl+A` would break typing in a parameter field.
   */
  scope: "workbench" | "editor";
}

export const VSCODE_DEFAULTS: readonly VsCodeDefault[] = [
  {
    chord: "Ctrl+N",
    command: "workbench.action.files.newUntitledFile",
    does: "New untitled file",
    scope: "workbench",
  },
  {
    chord: "Ctrl+O",
    command: "workbench.action.files.openFile",
    does: "Open file",
    scope: "workbench",
  },
  { chord: "Ctrl+S", command: "workbench.action.files.save", does: "Save", scope: "workbench" },
  {
    chord: "Ctrl+Shift+S",
    command: "workbench.action.files.saveAs",
    does: "Save as",
    scope: "workbench",
  },
  {
    chord: "Ctrl+W",
    command: "workbench.action.closeActiveEditor",
    does: "Close the active editor",
    scope: "workbench",
  },
  {
    chord: "Ctrl+P",
    command: "workbench.action.quickOpen",
    does: "Quick Open, go to file",
    scope: "workbench",
  },
  { chord: "Ctrl+X", command: "editor.action.clipboardCutAction", does: "Cut", scope: "editor" },
  { chord: "Ctrl+C", command: "editor.action.clipboardCopyAction", does: "Copy", scope: "editor" },
  {
    chord: "Ctrl+V",
    command: "editor.action.clipboardPasteAction",
    does: "Paste",
    scope: "editor",
  },
  { chord: "Ctrl+Z", command: "undo", does: "Undo", scope: "editor" },
  { chord: "Ctrl+Y", command: "redo", does: "Redo", scope: "editor" },
  { chord: "Ctrl+F", command: "actions.find", does: "Find", scope: "editor" },
  {
    chord: "Ctrl+H",
    command: "editor.action.startFindReplaceAction",
    does: "Replace",
    scope: "editor",
  },
  { chord: "Ctrl+G", command: "workbench.action.gotoLine", does: "Go to line", scope: "editor" },
  {
    chord: "Ctrl+T",
    command: "workbench.action.showAllSymbols",
    does: "Show all symbols in the workspace",
    scope: "workbench",
  },
  {
    chord: "Ctrl+D",
    command: "editor.action.addSelectionToNextFindMatch",
    does: "Add the next occurrence to the selection",
    scope: "editor",
  },
  {
    chord: "Ctrl+L",
    command: "expandLineSelection",
    does: "Select the current line",
    scope: "editor",
  },
  {
    chord: "Ctrl+U",
    command: "cursorUndo",
    does: "Undo the last cursor operation",
    scope: "editor",
  },
  {
    chord: "Ctrl+B",
    command: "workbench.action.toggleSidebarVisibility",
    does: "Toggle sidebar visibility",
    scope: "workbench",
  },
  { chord: "Ctrl+I", command: "inlineChat.start", does: "Open inline chat", scope: "editor" },
  {
    chord: "Ctrl+,",
    command: "workbench.action.openSettings",
    does: "Open Settings",
    scope: "workbench",
  },
  {
    chord: "Ctrl+/",
    command: "editor.action.commentLine",
    does: "Toggle a line comment",
    scope: "editor",
  },
  { chord: "Ctrl+.", command: "editor.action.quickFix", does: "Quick Fix", scope: "editor" },
  {
    chord: "Ctrl+\\",
    command: "workbench.action.splitEditor",
    does: "Split the editor",
    scope: "workbench",
  },
  {
    chord: "Ctrl+]",
    command: "editor.action.indentLines",
    does: "Indent the line",
    scope: "editor",
  },
  {
    chord: "Ctrl+[",
    command: "editor.action.outdentLines",
    does: "Outdent the line",
    scope: "editor",
  },
  { chord: "Ctrl+=", command: "workbench.action.zoomIn", does: "Zoom in", scope: "workbench" },
  { chord: "Ctrl+-", command: "workbench.action.zoomOut", does: "Zoom out", scope: "workbench" },
  {
    chord: "Ctrl+1",
    command: "workbench.action.focusFirstEditorGroup",
    does: "Focus the first editor group",
    scope: "workbench",
  },
  {
    chord: "Ctrl+2",
    command: "workbench.action.focusSecondEditorGroup",
    does: "Focus the second editor group",
    scope: "workbench",
  },
  {
    chord: "Ctrl+3",
    command: "workbench.action.focusThirdEditorGroup",
    does: "Focus the third editor group",
    scope: "workbench",
  },
  {
    chord: "Ctrl+Home",
    command: "cursorTop",
    does: "Go to the beginning of the file",
    scope: "editor",
  },
  {
    chord: "Ctrl+End",
    command: "cursorBottom",
    does: "Go to the end of the file",
    scope: "editor",
  },
  {
    chord: "Ctrl+Up",
    command: "scrollLineUp",
    does: "Scroll the view up one line",
    scope: "editor",
  },
  {
    chord: "Ctrl+Down",
    command: "scrollLineDown",
    does: "Scroll the view down one line",
    scope: "editor",
  },
  {
    chord: "Ctrl+Tab",
    command: "workbench.action.quickOpenPreviousRecentlyUsedEditorInGroup",
    does: "Navigate editor group history",
    scope: "workbench",
  },
  {
    chord: "Ctrl+Shift+N",
    command: "workbench.action.newWindow",
    does: "Open a new window",
    scope: "workbench",
  },
  {
    chord: "Ctrl+Shift+E",
    command: "workbench.view.explorer",
    does: "Show Explorer",
    scope: "workbench",
  },
  {
    chord: "Ctrl+Shift+F",
    command: "workbench.view.search",
    does: "Show Search",
    scope: "workbench",
  },
  {
    chord: "Ctrl+Shift+G",
    command: "workbench.view.scm",
    does: "Show Source Control",
    scope: "workbench",
  },
  {
    chord: "Ctrl+Shift+D",
    command: "workbench.view.debug",
    does: "Show Run and Debug",
    scope: "workbench",
  },
  {
    chord: "Ctrl+Shift+X",
    command: "workbench.view.extensions",
    does: "Show Extensions",
    scope: "workbench",
  },
  {
    chord: "Ctrl+Shift+H",
    command: "workbench.action.replaceInFiles",
    does: "Replace in files",
    scope: "workbench",
  },
  {
    chord: "Ctrl+Shift+J",
    command: "workbench.action.search.toggleQueryDetails",
    does: "Toggle search details",
    scope: "workbench",
  },
  {
    chord: "Ctrl+Shift+K",
    command: "editor.action.deleteLines",
    does: "Delete the current line",
    scope: "editor",
  },
  {
    chord: "Ctrl+Shift+L",
    command: "editor.action.selectHighlights",
    does: "Select all occurrences of the selection",
    scope: "editor",
  },
  {
    chord: "Ctrl+Shift+M",
    command: "workbench.actions.view.problems",
    does: "Show the Problems panel",
    scope: "workbench",
  },
  {
    chord: "Ctrl+Shift+O",
    command: "workbench.action.gotoSymbol",
    does: "Go to symbol in the file",
    scope: "editor",
  },
  {
    chord: "Ctrl+Shift+P",
    command: "workbench.action.showCommands",
    does: "Show all commands",
    scope: "workbench",
  },
  {
    chord: "Ctrl+Shift+R",
    command: "rerunSearchEditorSearch",
    does: "Search again, in a search editor",
    scope: "editor",
  },
  {
    chord: "Ctrl+Shift+T",
    command: "workbench.action.reopenClosedEditor",
    does: "Reopen the closed editor",
    scope: "workbench",
  },
  {
    chord: "Ctrl+Shift+U",
    command: "workbench.action.output.toggleOutput",
    does: "Show Output",
    scope: "workbench",
  },
  {
    chord: "Ctrl+Shift+V",
    command: "markdown.showPreview",
    does: "Toggle Markdown preview",
    scope: "workbench",
  },
  {
    chord: "Ctrl+Shift+A",
    command: "editor.action.blockComment",
    does: "Toggle a block comment",
    scope: "editor",
  },
  {
    chord: "Ctrl+Shift+C",
    command: "workbench.action.terminal.openNativeConsole",
    does: "Open a new command prompt",
    scope: "workbench",
  },
  {
    chord: "Ctrl+Shift+I",
    command: "workbench.action.chat.open",
    does: "Open chat in agent mode",
    scope: "workbench",
  },
  {
    chord: "Ctrl+Shift+Tab",
    command: "workbench.action.quickOpenLeastRecentlyUsedEditorInGroup",
    does: "Navigate editor group history backwards",
    scope: "workbench",
  },
  {
    chord: "Ctrl+Shift+\\",
    command: "editor.action.jumpToBracket",
    does: "Jump to the matching bracket",
    scope: "editor",
  },
  {
    chord: "Ctrl+Shift+[",
    command: "editor.fold",
    does: "Fold the current region",
    scope: "editor",
  },
  {
    chord: "Ctrl+Shift+]",
    command: "editor.unfold",
    does: "Unfold the current region",
    scope: "editor",
  },
  {
    chord: "F1",
    command: "workbench.action.showCommands",
    does: "Show all commands",
    scope: "workbench",
  },
  { chord: "F2", command: "editor.action.rename", does: "Rename symbol", scope: "editor" },
  {
    chord: "F5",
    command: "workbench.action.debug.start",
    does: "Start debugging, or continue",
    scope: "workbench",
  },
  {
    chord: "F8",
    command: "editor.action.marker.next",
    does: "Go to next error or warning",
    scope: "editor",
  },
  {
    chord: "F9",
    command: "editor.debug.action.toggleBreakpoint",
    does: "Toggle breakpoint",
    scope: "editor",
  },
  {
    chord: "F11",
    command: "workbench.action.toggleFullScreen",
    does: "Toggle full screen",
    scope: "workbench",
  },
  {
    chord: "F12",
    command: "editor.action.revealDefinition",
    does: "Go to definition",
    scope: "editor",
  },
  {
    chord: "Tab",
    command: "editor.action.inlineSuggest.commit",
    does: "Accept inline suggestion",
    scope: "editor",
  },
  {
    chord: "Escape",
    command: "(various)",
    does: "Dismiss — widgets, pickers, suggestions",
    scope: "editor",
  },
  {
    chord: "Alt+Up",
    command: "editor.action.moveLinesUpAction",
    does: "Move line up",
    scope: "editor",
  },
  {
    chord: "Alt+Down",
    command: "editor.action.moveLinesDownAction",
    does: "Move line down",
    scope: "editor",
  },
  {
    chord: "Home",
    command: "cursorHome",
    does: "Go to the beginning of the line",
    scope: "editor",
  },
  { chord: "End", command: "cursorEnd", does: "Go to the end of the line", scope: "editor" },
  // Not in the published table and the one that prompted this: a user reported Ctrl+R opening
  // VS Code's recent-files picker instead of rotating the selected component.
  {
    chord: "Ctrl+R",
    command: "workbench.action.openRecent",
    does: "Open Recent",
    scope: "workbench",
  },
  // `Ctrl+K` alone is VS Code's chord prefix. Pressing it starts waiting for a second key, so
  // a schematic binding on bare Ctrl+K never fires at all.
  {
    chord: "Ctrl+K",
    command: "(chord prefix)",
    does: "Waits for the second key of a chord",
    scope: "workbench",
  },
  {
    chord: "Ctrl+E",
    command: "workbench.action.quickOpen",
    does: "Quick Open",
    scope: "workbench",
  },
  {
    chord: "Ctrl+0",
    command: "workbench.action.focusSideBar",
    does: "Focus into the side bar",
    scope: "workbench",
  },
  {
    chord: "Ctrl+Shift+Y",
    command: "workbench.debug.action.toggleRepl",
    does: "Show the Debug Console",
    scope: "workbench",
  },
  {
    chord: "Ctrl+Shift+.",
    command: "breadcrumbs.focusAndSelect",
    does: "Focus and select breadcrumbs",
    scope: "workbench",
  },
  { chord: "Ctrl+A", command: "editor.action.selectAll", does: "Select all", scope: "editor" },
  { chord: "Ctrl+Shift+Z", command: "redo", does: "Redo", scope: "editor" },
  {
    chord: "Ctrl+Alt+Up",
    command: "editor.action.insertCursorAbove",
    does: "Insert a cursor above",
    scope: "editor",
  },
  {
    chord: "Ctrl+Alt+Down",
    command: "editor.action.insertCursorBelow",
    does: "Insert a cursor below",
    scope: "editor",
  },
  {
    chord: "Ctrl+Alt+Left",
    command: "workbench.action.moveEditorToPreviousGroup",
    does: "Move the editor into the previous group",
    scope: "workbench",
  },
  {
    chord: "Ctrl+Alt+Right",
    command: "workbench.action.moveEditorToNextGroup",
    does: "Move the editor into the next group",
    scope: "workbench",
  },
  {
    chord: "F6",
    command: "workbench.action.focusNextPart",
    does: "Focus the next part of the workbench",
    scope: "workbench",
  },
  {
    chord: "F7",
    command: "editor.action.accessibleViewNext",
    does: "Next in the accessible view",
    scope: "editor",
  },
  {
    chord: "F10",
    command: "workbench.action.debug.stepOver",
    does: "Step over, while debugging",
    scope: "workbench",
  },
  {
    chord: "Shift+F11",
    command: "workbench.action.debug.stepOut",
    does: "Step out, while debugging",
    scope: "workbench",
  },
];

/** Index by chord, for the conflict calculation. */
export const VSCODE_DEFAULT_BY_CHORD: ReadonlyMap<string, VsCodeDefault> = new Map(
  VSCODE_DEFAULTS.map((entry) => [entry.chord.toLowerCase(), entry]),
);
