import { tools } from "./tools/index.js";
export type ToolName = keyof typeof tools;

export const executeTool = async (name: string, args: any) => {
  const tool = tools[name as ToolName];

  if (!tool) {
    return "Unknown tool, this is not exist";
  }

  const execute = (
    tool as {
      execute?: (
        args: unknown,
        options: { toolCallId: string; messages: unknown[] },
      ) => unknown | Promise<unknown>;
    }
  ).execute;

  if (!execute) {
    return "This is not a registered tool";
  }

  const result = await execute(args, {
    toolCallId: "",
    messages: [],
  });

  return String(result);
};
