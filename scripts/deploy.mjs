import { readFileSync } from "node:fs";
import { join } from "node:path";
import { root,wrangler,runNode } from "./cloudflare-cli.mjs";
import { prepareRuntimeSecrets } from "./runtime-secrets.mjs";
let runtimeSecrets;
try{
  const config=JSON.parse(readFileSync(join(root,"wrangler.jsonc"),"utf8"));
  if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(config.d1_databases?.[0]?.database_id||""))throw new Error("Add your real D1 database ID to wrangler.jsonc, or run npm run cf:setup first. See INSTALLATION.md.");
  if(process.argv.includes("--check")){console.log("Deployment configuration is ready.");process.exit(0);}
  runtimeSecrets=prepareRuntimeSecrets();
  runNode("scripts/build.mjs");
  wrangler(["d1","migrations","apply","DB","--remote"]);
  wrangler(["deploy",...(runtimeSecrets?["--secrets-file",runtimeSecrets.path]:[])]);
}catch(error){console.error("Deployment stopped:",error.message);process.exitCode=1;}
finally{runtimeSecrets?.dispose();}
