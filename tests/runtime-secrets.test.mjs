import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { prepareRuntimeSecrets } from "../scripts/runtime-secrets.mjs";

test("deployment without build passwords preserves existing runtime settings", () => {
  assert.equal(prepareRuntimeSecrets({ OTHER_TOKEN: "not-a-runtime-binding" }), null);
});

test("only sign-in secrets enter a private temporary file that is removed", () => {
  const values = { ADMIN_PASSWORD: "test-admin-password", LEARNER_ACCESS_CODE: "test-learner-code" };
  const prepared = prepareRuntimeSecrets({ ...values, CLOUDFLARE_API_TOKEN: "exclude-this" });
  try {
    assert.deepEqual(JSON.parse(readFileSync(prepared.path, "utf8")), values);
    assert.equal(statSync(prepared.path).mode & 0o777, 0o600);
    assert.equal(statSync(dirname(prepared.path)).mode & 0o777, 0o700);
  } finally {
    prepared.dispose();
  }
  assert.equal(existsSync(dirname(prepared.path)), false);
  prepared.dispose();
});

test("one supplied secret leaves the other runtime secret untouched", () => {
  const prepared = prepareRuntimeSecrets({ ADMIN_PASSWORD: "test-admin-password" });
  try {
    assert.deepEqual(JSON.parse(readFileSync(prepared.path, "utf8")), { ADMIN_PASSWORD: "test-admin-password" });
  } finally {
    prepared.dispose();
  }
});

test("invalid and matching build passwords fail without exposing values", () => {
  for (const [name, value] of [["ADMIN_PASSWORD", "short"], ["LEARNER_ACCESS_CODE", ""], ["ADMIN_PASSWORD", 123]]) {
    assert.throws(() => prepareRuntimeSecrets({ [name]: value }), new RegExp(`${name} in the build environment`));
  }
  assert.throws(() => prepareRuntimeSecrets({ ADMIN_PASSWORD: "same-test-password", LEARNER_ACCESS_CODE: "same-test-password" }), /must be different/);
});
