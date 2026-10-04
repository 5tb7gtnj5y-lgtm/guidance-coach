import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
export const root=fileURLToPath(new URL("../",import.meta.url));
const cli=fileURLToPath(new URL("../node_modules/wrangler/bin/wrangler.js",import.meta.url));
export function wrangler(args,{capture=false}={}){
  const result=spawnSync(process.execPath,[cli,...args],{cwd:root,encoding:"utf8",stdio:capture?"pipe":"inherit",env:{...process.env,NO_COLOR:"1",WRANGLER_SEND_METRICS:"false"}});
  if(result.error)throw result.error;
  if(result.status!==0){if(capture)process.stderr.write(result.stderr||result.stdout||"");throw new Error(`Cloudflare command failed: wrangler ${args.join(" ")}`);}
  return result.stdout||"";
}
export function runNode(script){
  const result=spawnSync(process.execPath,[script],{cwd:root,stdio:"inherit"});
  if(result.error)throw result.error;
  if(result.status!==0)throw new Error(`Script failed: ${script}`);
}
