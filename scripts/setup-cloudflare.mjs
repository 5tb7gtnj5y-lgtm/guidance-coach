import { readFileSync,writeFileSync } from "node:fs";
import { join } from "node:path";
import { root,wrangler } from "./cloudflare-cli.mjs";
try{
  const configPath=join(root,"wrangler.jsonc"),config=JSON.parse(readFileSync(configPath,"utf8"));
  const database=config.d1_databases[0],bucket=config.r2_buckets[0];
  console.log("Preparing Cloudflare resources. Run npx wrangler login first, and enable R2 in your Cloudflare account.");
  let databases=JSON.parse(wrangler(["d1","list","--json"],{capture:true}));
  let existing=databases.find(item=>item.name===database.database_name);
  if(!existing){
    wrangler(["d1","create",database.database_name,"--update-config=false"]);
    databases=JSON.parse(wrangler(["d1","list","--json"],{capture:true}));
    existing=databases.find(item=>item.name===database.database_name);
  }
  if(!existing?.uuid)throw new Error("Could not find the database ID. Copy it from Cloudflare into wrangler.jsonc.");
  const buckets=wrangler(["r2","bucket","list"],{capture:true});
  const names=Array.from(buckets.matchAll(/^\s*name:\s*(\S+)/gmi),match=>match[1]);
  if(!names.includes(bucket.bucket_name))wrangler(["r2","bucket","create",bucket.bucket_name,"--update-config=false"]);
  database.database_id=existing.uuid;
  writeFileSync(configPath,JSON.stringify(config,null,2)+"\n");
  console.log("\nReady. Your database ID is saved in wrangler.jsonc.");
  console.log("Next: npm run deploy. Then set ADMIN_PASSWORD and LEARNER_ACCESS_CODE as Cloudflare Worker secrets (see INSTALLATION.md).");
}catch(error){console.error("Setup stopped:",error.message);process.exitCode=1;}
