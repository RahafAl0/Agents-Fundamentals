import { tool } from "ai";
import { z } from "zod";

const dateTimeInputSchema = z.union([z.object({}), z.null()]).optional();

export const dateTime = tool({
  description:
    "Return the current date and time. Use this tool before any time related task.",
  inputSchema: dateTimeInputSchema,
  // execute: async () => {
  //   return new Date().toString();
  // },
});
