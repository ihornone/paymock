/**
 * Runtime-only environment access.
 *
 * A direct `process.env.NEXT_PUBLIC_*` member expression is statically
 * substituted by Next.js at build time: whatever value happens to exist in
 * the build environment gets frozen into the bundle. Bracket access is left
 * untouched, so the value resolves from the Worker's runtime variables on
 * every request — a stale build variable can never shadow the deployment's
 * real configuration (e.g. the Clerk publishable key from wrangler.toml).
 */
export function readRuntimeEnv(name: string): string | undefined {
  const env = process.env as Record<string, string | undefined>;
  return env[name];
}
