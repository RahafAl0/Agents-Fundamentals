import "../src/config/env.ts";
import {
  generateText,
  stepCountIs,
  tool,
  type ModelMessage,
  type ToolSet,
} from "ai";
import { groq } from "@ai-sdk/groq";
import { z } from "zod";

import type { EvalData, MultiTurnEvalData, SingleTurnResult } from "./types.ts";
import { buildMessages, buildMockedTools } from "./utils.ts";
import type { M } from "@lmnr-ai/lmnr/dist/evaluations-CUQthK1O";
import { SYSTEM_PROMPT } from "../dist/agent/system/prompt";
import { text } from "stream/consumers";

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

export const multiTurnWithMocks = async (data: MultiTurnEvalData) => {
  const tools = buildMockedTools(data.mockTools);

  const messages: ModelMessage[] = data.messages ?? [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: data.prompt! },
  ];

  const result = await generateText({
    model: groq(data.config?.model || DEFAULT_EVAL_MODEL),
    messages,
    tools,
    stopWhen: stepCountIs(data.config?.maxSteps ?? 20),
  });

  const allToolCalls: string[] = [];
  const steps = result.steps.map((step) => {
    const stepToolCalls = (step.toolCalls ?? []).map((tc) => {
      allToolCalls.push(tc.toolName);
      return {
        toolName: tc.toolName,
        args: "args" in tc ? tc.args : {},
      };
    });

    const stepToolResults = (step.staticToolResults ?? []).map((tr) => ({
      toolName: tr.toolName,
      result: "result" in tr ? tr.result : {},
    }));

    return {
      ToolCalls: stepToolCalls.length > 0 ? stepToolCalls : undefined,
      toolResults: stepToolResults.length > 0 ? stepToolResults : undefined,
      text: step.text || undefined,
    };
  });

  const toolsUsed = [new Set(allToolCalls)];

  return {
    text: result.text,
    steps,
    toolsUsed,
    toolCallOrder: allToolCalls,
  };
};
