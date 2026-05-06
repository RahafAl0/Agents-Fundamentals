import { Laminar, observe } from "@lmnr-ai/lmnr";

let laminarEnabled = false;

export function initializeLaminar(): boolean {
  if (Laminar.initialized()) {
    laminarEnabled = true;
    return true;
  }

  const projectApiKey = process.env.LMNR_PROJECT_API_KEY;

  if (!projectApiKey) {
    laminarEnabled = false;
    return false;
  }

  Laminar.initialize({
    projectApiKey,
  });

  laminarEnabled = true;
  return true;
}

export function isLaminarEnabled(): boolean {
  return laminarEnabled || Laminar.initialized();
}

export async function withLaminarObservation<T>(
  name: string,
  input: unknown,
  fn: () => Promise<T>,
): Promise<T> {
  if (!isLaminarEnabled()) {
    return fn();
  }

  return observe(
    {
      name,
      input,
    },
    fn,
  );
}
