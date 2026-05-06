import { evaluate } from "@lmnr-ai/lmnr";
import {
  toolsSelected,
  toolsAvoided,
  toolSelectionScore,
} from "./evaluators.ts";
import type { EvalData, EvalTarget } from "./types.ts";
import dataset from "./data/file-tools.json" with { type: "json" };
import { singleTurnExecuterWithMocks } from "./executors.ts";

const lmnrProjectApiKey =
  process.env.LMNR_PROJECT_API_KEY ?? process.env.LMNR_API_KEY;

if (!lmnrProjectApiKey) {
  throw new Error(
    "Missing LMNR_PROJECT_API_KEY in .env. Add the Laminar project API key from your project settings.",
  );
}

const executor = async (data: EvalData) => {
  return singleTurnExecuterWithMocks(data);
};

evaluate({
  data: dataset as Array<{ data: EvalData; target: EvalTarget }>,
  executor,
  evaluators: {
    toolsSelected: (output, target) => {
      if (target?.category !== "golden") return 1; 
      return toolsSelected(output, target);
    },
    toolsAvoided: (output, target) => {
      if (target?.category !== "negative") return 1;
      return toolsAvoided(output, target);
    },
    selectionScore: (output, target) => {
      if (target?.category !== "secondary") return 1; 
      return toolSelectionScore(output, target);
    },
  },
  config: {
    projectApiKey: lmnrProjectApiKey,
  },
  groupName: "file-tools-selection",
});
