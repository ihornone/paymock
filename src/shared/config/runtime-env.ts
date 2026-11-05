export function readRuntimeEnv(name: string): string | undefined {
  const env = process.env as Record<string, string | undefined>;
  return env[name];
}
