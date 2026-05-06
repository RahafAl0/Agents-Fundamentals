import { tools } from "./tools/index.js";
export type ToolName = keyof typeof tools;

export const executeTool = async (name: string, args: any) => {
  const tool = tools[name as ToolName];

  if (!tool) {
    return "Unknown tool, this is not exist";
  }

  const execute = tool.execute;

  if (!execute) {
    return "This is not a regited tool";
  }

  const result = await execute(args, {
    toolCallId: "",
    messages: [],
  });

  return String(result);
};
