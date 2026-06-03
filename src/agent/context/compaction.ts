import { generateText, type ModelMessage } from "ai";
import { groq } from "@ai-sdk/groq";
import { extractMessageText } from "./tokenEstimator.ts";

const SUMMARIZATION_PROMPT = `
Summarize the conversation below so it can be restored as context for a future
assistant turn. Preserve user goals, decisions, constraints, important file
paths, tool results, and unresolved next steps. Keep it concise but specific.

Conversation:
`;

/**
 * Format messages array as readable text for summarization
 */
function messagesToText(messages: ModelMessage[]): string {
  return messages
    .map((msg) => {
      const role = msg.role.toUpperCase();
      const content = extractMessageText(msg);
      return `[${role}]: ${content}`;
    })
    .join("\n\n");
}

/**
 * Compact a conversation by summarizing it with an LLM.
 *
 * Takes the current messages (excluding system prompt) and returns a new
 * messages array with:
 * - A user message containing the summary
 * - An assistant acknowledgment
 *
 * The system prompt should be prepended by the caller.
 */
export async function compactConversation(
  messages: ModelMessage[],
  model: string = "llama-3.1-8b-instant",
): Promise<ModelMessage[]> {
  const conversationMessages = messages.filter((msg) => msg.role !== "system");

  if (conversationMessages.length === 0) {
    return [];
  }

  const conversationText = messagesToText(conversationMessages);

  const { text: summary } = await generateText({
    model: groq(model),
    prompt: SUMMARIZATION_PROMPT + conversationText,
  });

  const compactedMessages: ModelMessage[] = [
    {
      role: "user",
      content: `[CONVERSATION SUMMARY]\nThe following is a summary of our conversation so far:\n\n${summary}\n\nPlease continue from where we left off.`,
    },
    {
      role: "assistant",
      content:
        "I understand. I've reviewed the summary of our conversation and I'm ready to continue. How can I help you next?",
    },
  ];

  return compactedMessages;
}
