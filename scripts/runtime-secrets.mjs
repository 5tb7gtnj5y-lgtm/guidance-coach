import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Only these build secrets may become Worker runtime bindings. Never log values.
export function prepareRuntimeSecrets(env = process.env) {
  const secrets = {};
  for (const [name, minimum] of [["ADMIN_PASSWORD", 12], ["LEARNER_ACCESS_CODE", 8]]) {
    if (env[name] === undefined) continue;
    if (typeof env[name] !== "string" || env[name].length < minimum) {
      throw new Error(`${name} in the build environment must contain at least ${minimum} characters.`);
    }
    secrets[name] = env[name];
  }
  if (!Object.keys(secrets).length) return null;
  if (secrets.ADMIN_PASSWORD && secrets.ADMIN_PASSWORD === secrets.LEARNER_ACCESS_CODE) {
    throw new Error("ADMIN_PASSWORD and LEARNER_ACCESS_CODE must be different.");
  }
  const directory = mkdtempSync(join(tmpdir(), "guidance-coach-secrets-"));
  const path = join(directory, "runtime.json");
  const dispose = () => rmSync(directory, { recursive: true, force: true });
  try {
    writeFileSync(path, JSON.stringify(secrets), { mode: 0o600 });
    return { path, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}
