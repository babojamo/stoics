import { env } from "cloudflare:workers";

export function getRuntimeEnv() {
  return env as unknown as Record<string, string | undefined>;
}

