import { readFile, writeFile, listFiles, deleteFile } from "./file.ts";
import { webSearch } from "./webSearch.ts";

export const tools = {
  readFile,
  writeFile,
  listFiles,
  deleteFile,

  webSearch,
};

export { readFile, writeFile, listFiles, deleteFile } from "./file.ts";

export { webSearch } from "./webSearch.ts";

// Tool sets for evals
export const fileTools = {
  readFile,
  writeFile,
  listFiles,
  deleteFile,
};
