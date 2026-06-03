import "../config/env.ts";
import { streamText, type ModelMessage } from "ai";
import { groq } from "@ai-sdk/groq";
import { getTracer, Laminar } from "@lmnr-ai/lmnr";
import { executeTool } from "./executeTools.js";
import { SYSTEM_PROMPT } from "./system/prompt.ts";
import { filterCompatibleMessages } from "./system/filterMessages.ts";
import { tools } from "./tools/index.js";
import type { AgentCallbacks, ToolCallInfo } from "../types.ts";
import {
  estimateMessagesTokens,
  getModelLimits,
  isOverThreshold,
  calculateUsagePercentage,
  compactConversation,
  DEFAULT_THRESHOLD,
} from "./context/index.ts";

const LMNR_PROJECT_API_KEY =
  process.env.LMNR_PROJECT_API_KEY ?? process.env.LMNR_API_KEY;

if (LMNR_PROJECT_API_KEY && !Laminar.initialized()) {
  Laminar.initialize({
    projectApiKey: LMNR_PROJECT_API_KEY,
  });
}

const MODEL_NAME = "openai/gpt-oss-20b";

export async function runAgent(
  userMessage: string,
  conversationHistory: ModelMessage[],
  callbacks: AgentCallbacks,
): Promise<ModelMessage[]> {
  const modelLimits = getModelLimits(MODEL_NAME);
  const workingHistory = filterCompatibleMessages(conversationHistory);

  let messages: ModelMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...workingHistory,
    { role: "user", content: userMessage },
  ];

  const preCheckTokens = estimateMessagesTokens(messages);
  if (isOverThreshold(preCheckTokens.total, modelLimits.contextWindow)) {
    // Compact the conversation
    messages = await compactConversation(workingHistory, MODEL_NAME);
  }
  
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

    const reportTokenUsage = () => {
      if (callbacks.onTokenUsage) {
        const usage = estimateMessagesTokens(messages);
        callbacks.onTokenUsage({
          inputTokens: usage.input,
          outputTokens: usage.output,
          totalTokens: usage.total,
          contextWindow: modelLimits.contextWindow,
          threshold: DEFAULT_THRESHOLD,
          percentage: calculateUsagePercentage(
            usage.total,
            modelLimits.contextWindow,
          ),
        });
      }
    };

    reportTokenUsage();

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

    if (finishReason !== "tool-calls" || toolCalls.length === 0) {
      const responseMessage = await result.response;
      messages.push(...responseMessage.messages);
      reportTokenUsage();
      break;
    }

    const responseMessages = await result.response;
    messages.push(...responseMessages.messages);

    for (const tc of toolCalls) {
      const result = await executeTool(tc.toolName, tc.args);
      callbacks.onToolCallEnd(tc.toolName, result);

      messages.push({
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: tc.toolCallId,
            toolName: tc.toolName,
            output: { type: "text", value: result },
          },
        ],
      });
      reportTokenUsage();
    }
  }

  callbacks.onComplete(fullResponse);

  return messages;
}
