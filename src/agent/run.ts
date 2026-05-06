import "dotenv/config";
import { streamText, type ModelMessage } from "ai";
import { groq } from "@ai-sdk/groq";
import { getTracer, Laminar } from "@lmnr-ai/lmnr";
import { executeTool } from "./executeTools.js";
import { SYSTEM_PROMPT } from "./system/prompt.ts";
import { filterCompatibleMessages } from "./system/filterMessages.ts";
import { tools } from "./tools/index.js";
import type { AgentCallbacks, ToolCallInfo } from "../types.ts";

const LMNR_PROJECT_API_KEY =
  process.env.LMNR_PROJECT_API_KEY ?? process.env.LMNR_API_KEY;

if (LMNR_PROJECT_API_KEY && !Laminar.initialized()) {
  Laminar.initialize({
    projectApiKey: LMNR_PROJECT_API_KEY,
  });
}

const MODEL_NAME = "llama-3.1-8b-instant";

export async function runAgent(
  userMessage: string,
  conversationHistory: ModelMessage[],
  callbacks: AgentCallbacks,
): Promise<ModelMessage[]> {
  const workingHistory = filterCompatibleMessages(conversationHistory);

  const messages: ModelMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...workingHistory,
    { role: "user", content: userMessage },
  ];

  let fullResponse = "";

  while (true) {
    const result = streamText({
      model: groq(MODEL_NAME),
      messages,
      tools,
      experimental_telemetry: {
        isEnabled: Laminar.initialized(),
        functionId: "runAgent",
        metadata: {
          model: MODEL_NAME,
        },
        tracer: getTracer(),
      },
    });

    const toolCalls: ToolCallInfo[] = [];
    let currentText = "";
    let streamError: Error | null = null;

    try {
      for await (const chunk of result.fullStream) {
        if (chunk.type === "text-delta") {
          currentText += chunk.text;
          callbacks.onToken(chunk.text);
        }

        if (chunk.type === "tool-call") {
          const input = "input" in chunk ? chunk.input : {};
          toolCalls.push({
            toolCallId: chunk.toolCallId,
            toolName: chunk.toolName,
            args: input as Record<string, unknown>,
          });
          callbacks.onToolCallStart(chunk.toolName, input);
        }
      }
    } catch (error) {
      streamError = error as Error;

      if (
        !currentText &&
        !streamError.message.includes("No output generated")
      ) {
        throw streamError;
      }
    }

    fullResponse += currentText;

    if (streamError && !currentText) {
      fullResponse =
        "I apologize, but I wasn't able to generate a response. Could you please try rephrasing your message?";
      callbacks.onToken(fullResponse);
      break;
    }

    const finishReason = await result.finishReason;
    const responseMessages = await result.response;
    messages.push(...responseMessages.messages);

    if (finishReason !== "tool-calls" || toolCalls.length === 0) {
      break;
    }

    for (const toolCall of toolCalls) {
      const toolResult = await executeTool(toolCall.toolName, toolCall.args);
      callbacks.onToolCallEnd(toolCall.toolName, toolResult);

      messages.push({
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: toolCall.toolCallId,
            toolName: toolCall.toolName,
            output: {
              type: "text",
              value: toolResult,
            },
          },
        ],
      });
    }
  }

  callbacks.onComplete(fullResponse);

  return messages;
}
