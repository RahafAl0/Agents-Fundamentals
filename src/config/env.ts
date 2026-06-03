import { config } from "dotenv";
import { fileURLToPath } from "node:url";

const projectEnvPath = fileURLToPath(new URL("../../.env", import.meta.url));

config({ quiet: true });
config({ path: projectEnvPath, quiet: true });
