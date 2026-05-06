import { generateText, stepCountIs, tool, type ToolSet } from "ai";
import { groq } from "@ai-sdk/groq";
import { z } from "zod";

import type { EvalData, SingleTurnResult } from "./types.ts";
import { buildMessages } from "./utils.ts";

const DEFAULT_EVAL_MODEL = "openai/gpt-oss-20b";
const TOOL_SELECTION_PROMPT =
  "For this evaluation, only call one of the tools explicitly provided in the request. If the user asks for anything unrelated to files, answer normally without calling tools. Never invent tools.";

const TOOL_DEFINITIONS = {
  readFile: {
    description: "Read the contents of a file at the specified path.",
    parameters: z.object({
      path: z.string().describe("The path to the file that you want to read."),
    }),
  },
  writeFile: {
    description: "Write content to a file at the specified path",
    parameters: z.object({
      path: z.string().describe("The path to the file to write"),
      content: z.string().describe("The content to write to the file"),
    }),
  },
  listFiles: {
    description: "List all files in a directory",
    parameters: z.object({
      path: z.string().describe("The directory path to list files from"),
    }),
  },
  deleteFile: {
    description: "Delete a file at the specified path",
    parameters: z.object({
      path: z.string().describe("The path to the file to delete"),
    }),
  },
  // Shell tools
  runCommand: {
    description: "Execute a shell command and return its output",
    parameters: z.object({
      command: z.string().describe("The shell command to execute"),
    }),
  },
};

export async function singleTurnExecuterWithMocks(
  data: EvalData,
): Promise<SingleTurnResult> {
  const messages = buildMessages(data).map((message) =>
    message.role === "system"
      ? {
          ...message,
          content: `${message.content}\n\n${TOOL_SELECTION_PROMPT}`,
        }
      : message,
  );

  // Build mocked tools from definitions
  const tools: ToolSet = {};
  for (const toolName of data.tools) {
    const def = TOOL_DEFINITIONS[toolName];
    if (def) {
      tools[toolName] = tool({
        description: def.description,
        inputSchema: def.parameters,
      });
    }
  }
  const modelName = data.config?.model || DEFAULT_EVAL_MODEL;
  const providerOptions = modelName.startsWith("openai/gpt-oss")
    ? {
        groq: {
          reasoningEffort: "high" as const,
        },
      }
    : undefined;

  const { toolCalls } = await generateText({
    model: groq(modelName),
    messages,
    tools,
    stopWhen: stepCountIs(1),
    temperature: data.config?.temperature ?? undefined,
    providerOptions,
  });

  const calls = toolCalls.map((tc) => ({
    toolName: tc.toolName,
    args: "input" in tc ? tc.input : {},
  }));

  const toolNames = calls.map((tc) => tc.toolName);

  return {
    toolCalls: calls,
    toolNames,
    selectedAny: toolNames.length > 0,
  };
}
