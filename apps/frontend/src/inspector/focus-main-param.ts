interface FocusMainParamArgs {
  selection: string[];
  blocks: Record<string, { id: string; type: string }>;
  metadata: Record<string, { main_param?: string }>;
  focusEditor: (blockId: string, paramName: string) => void;
}

export function focusMainParam(args: FocusMainParamArgs) {
  if (args.selection.length !== 1) {
    return;
  }
  const blockId = args.selection[0];
  if (!blockId) {
    return;
  }
  const block = args.blocks[blockId];
  if (!block) {
    return;
  }
  const mainParam = args.metadata[block.type]?.main_param;
  if (!mainParam) {
    return;
  }
  args.focusEditor(blockId, mainParam);
}

export default focusMainParam;
