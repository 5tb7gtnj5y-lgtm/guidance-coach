import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync,readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require=createRequire(import.meta.url);
const {Miniflare}=require("miniflare");
const path=relative=>fileURLToPath(new URL(relative,import.meta.url));
const adminPassword="local-test-admin-password",learnerCode="local-test-learner-code";
const origin="https://guidance.example";
const fakeAI=`import {WorkerEntrypoint} from "cloudflare:workers";
export class FakeAI extends WorkerEntrypoint {
 async run(model,options){
  if(model!=="@cf/meta/llama-3.3-70b-instruct-fp8-fast")throw new Error("Unexpected model");
  const message=options.messages.at(-1).content;
  if(message==="simulate allowance")throw new Error("3036 daily neuron limit exceeded");
  const prompt=options.messages[0].content;
  const source=JSON.parse(prompt.split("SOURCE SECTIONS (JSON data): ")[1])[0];
  const retry=prompt.startsWith("SOURCE CHECK RETRY:");
  const invalid=message==="invalid citation"||(message==="retry citation"&&!retry);
  return {response:JSON.stringify({reply:retry?"Recovered a source-cited reply.":"Use the steps described in your uploaded guidance.",question:"How would you apply this step?",citations:[{sectionId:source.id,quote:invalid?"This quotation was invented by the model.":source.text.slice(0,120)}]})};
 }
}
export default {fetch(){return new Response("Test service");}};`;

test("Cloudflare application: sign-in, administration and guidance coaching",async t=>{
  const options={cf:false,workers:[{
    name:"guidance",scriptPath:path("../dist/worker.js"),modules:true,
    compatibilityDate:"2026-05-15",compatibilityFlags:["nodejs_compat"],
    bindings:{ADMIN_PASSWORD:adminPassword,LEARNER_ACCESS_CODE:learnerCode},
    d1Databases:{DB:"guidance-test-db"},r2Buckets:{BUCKET:"guidance-test-files"},
    serviceBindings:{AI:{name:"mock-ai",entrypoint:"FakeAI"}},
    assets:{directory:path("../dist/client"),binding:"ASSETS",routerConfig:{invoke_user_worker_ahead_of_assets:true,has_user_worker:true},assetConfig:{not_found_handling:"single-page-application"}},
  },{name:"mock-ai",script:fakeAI,modules:true,compatibilityDate:"2026-05-15"}]};
  const mf=new Miniflare(options);
  try{
    const db=await mf.getD1Database("DB","guidance");
    for(const name of readdirSync(path("../migrations")).sort()){
      const statements=readFileSync(path(`../migrations/${name}`),"utf8").split(";").map(s=>s.trim()).filter(Boolean);
      await db.batch(statements.map(s=>db.prepare(s)));
    }
    let adminCookies="",learnerCookies="",documentId;
    const request=async (route,{method="GET",cookies="",data,body,headers={}}={})=>{
      const allHeaders={...headers};if(cookies)allHeaders.Cookie=cookies;
      if(method!=="GET")allHeaders.Origin=allHeaders.Origin||origin;
      if(data!==undefined){body=JSON.stringify(data);allHeaders["Content-Type"]="application/json";}
      if(body instanceof FormData){const encoded=new Request(origin+route,{method,body});allHeaders["Content-Type"]=encoded.headers.get("Content-Type");body=await encoded.arrayBuffer();}
      return mf.dispatchFetch(origin+route,{method,headers:allHeaders,body});
    };
    const cookieJar=response=>{
      const values=response.headers.getSetCookie?.()||[response.headers.get("Set-Cookie")];
      return values.filter(Boolean).flatMap(value=>value.split(/, (?=__Host-)/)).map(value=>value.split(";")[0]).join("; ");
    };
    await t.test("serves the built website, assets and ready health check",async()=>{
      const page=await request("/");assert.equal(page.status,200);assert.match(await page.text(),/Guidance Coach/);
      assert.match(page.headers.get("Content-Security-Policy"),/frame-ancestors 'none'/);
      assert.equal(page.headers.get("Permissions-Policy"),"camera=(), microphone=(self), geolocation=()");
      const pdfWorker=await request("/pdf.worker.min.mjs");assert.equal(pdfWorker.status,200);assert.ok((await pdfWorker.text()).length>10000);
      const health=await (await request("/api/health")).json();assert.equal(health.status,"ready");assert.equal(health.adminConfigured,true);
    });
    await t.test("rejects anonymous access, forged identity headers and cross-site login",async()=>{
      assert.equal((await request("/api/workspace")).status,401);
      assert.equal((await request("/api/workspace?admin=1",{headers:{"x-oai-user-id":"admin","x-oai-user-email":"admin@example.test"}})).status,401);
      assert.equal((await request("/api/auth/login",{method:"POST",data:{role:"admin",password:adminPassword},headers:{Origin:"https://another.example"}})).status,403);
      assert.equal((await request("/api/auth/login",{method:"POST",data:{role:"admin",password:"incorrect"}})).status,401);
    });
    await t.test("sets two secure cookies and isolates learner permissions",async()=>{
      const admin=await request("/api/auth/login",{method:"POST",data:{role:"admin",password:adminPassword}});assert.equal(admin.status,200);
      assert.match(admin.headers.get("Set-Cookie"),/HttpOnly/);assert.match(admin.headers.get("Set-Cookie"),/Secure/);assert.match(admin.headers.get("Set-Cookie"),/SameSite=Strict/);
      adminCookies=cookieJar(admin);assert.match(adminCookies,/__Host-guidance_session=/);assert.match(adminCookies,/__Host-guidance_device=/);
      assert.equal((await (await request("/api/auth/me",{cookies:adminCookies})).json()).admin,true);
      const learner=await request("/api/auth/login",{method:"POST",data:{role:"learner",password:learnerCode}});assert.equal(learner.status,200);learnerCookies=cookieJar(learner);
      assert.equal((await request("/api/workspace?admin=1",{cookies:learnerCookies})).status,403);
      assert.equal((await request("/api/guidance",{method:"POST",cookies:learnerCookies,body:new FormData()})).status,403);
      const stored=await db.prepare("SELECT token_hash FROM auth_sessions").all();
      assert.equal(stored.results.length,2);assert.ok(stored.results.every(row=>!adminCookies.includes(row.token_hash)&&!learnerCookies.includes(row.token_hash)));
    });
    await t.test("saves a draft with its original file, hides it from learners",async()=>{
      await request("/api/workspace",{cookies:adminCookies});
      const content="# Check the request\nAsk the person to explain their request. Check your summary with them before proceeding.\n\n## Record it\nRecord the checked contact details and send the request through the approved route.";
      const form=new FormData();form.set("title","Uploaded practice guide");form.set("description","A test of the complete upload flow.");form.set("content",content);form.set("file",new File([content],"practice.md",{type:"text/markdown"}));
      const result=await request("/api/guidance",{method:"POST",cookies:adminCookies,body:form});assert.equal(result.status,201);const saved=(await result.json()).document;documentId=saved.id;assert.equal(saved.status,"draft");assert.equal(saved.sections.length,2);
      assert.equal((await request(`/api/guidance/${documentId}`,{cookies:learnerCookies})).status,404);
      const list=await (await request("/api/workspace",{cookies:learnerCookies})).json();assert.ok(!list.documents.some(doc=>doc.id===documentId));
      const original=await request(`/api/guidance/${documentId}/original`,{cookies:adminCookies});assert.equal(original.status,200);assert.equal(await original.text(),content);assert.match(original.headers.get("Content-Disposition"),/attachment/);
    });
    await t.test("publishes guidance and persists a source-cited coaching response",async()=>{
      const published=await request(`/api/guidance/${documentId}`,{method:"PATCH",cookies:adminCookies,data:{status:"published",version:1}});assert.equal(published.status,200);
      const guide=(await (await request(`/api/guidance/${documentId}`,{cookies:learnerCookies})).json()).document;
      assert.equal(guide.status,"published");assert.equal((await request(`/api/guidance/${documentId}/original`,{cookies:learnerCookies})).status,200);
      const started=await request("/api/session",{method:"POST",cookies:learnerCookies,data:{documentId}});assert.equal(started.status,200);
      const coached=await request("/api/coach",{method:"POST",cookies:learnerCookies,data:{documentId,version:1,step:0,message:"Explain this step"}});assert.equal(coached.status,200);
      const session=(await coached.json()).session;assert.equal(session.messages.length,2);const cite=session.messages[1].citations[0];assert.ok(guide.sections.find(section=>section.id===cite.sectionId).text.includes(cite.quote));
      const resumed=await (await request("/api/session",{method:"POST",cookies:learnerCookies,data:{documentId}})).json();assert.deepEqual(resumed.session.messages,session.messages);
    });
    await t.test("replaces fabricated quotes with a source excerpt and preserves progress on allowance failure",async()=>{
      const fallback=await request("/api/coach",{method:"POST",cookies:learnerCookies,data:{documentId,version:1,step:0,message:"invalid citation"}});
      assert.equal(fallback.status,200);
      const session=(await fallback.json()).session;
      assert.equal(session.messages.length,4);
      const reply=session.messages[3];
      assert.match(reply.content,/source excerpt/);
      assert.ok(!reply.content.includes("This quotation was invented by the model."));
      const guide=(await (await request(`/api/guidance/${documentId}`,{cookies:learnerCookies})).json()).document;
      const cite=reply.citations[0];
      assert.ok(guide.sections.find(s=>s.id===cite.sectionId).text.includes(cite.quote));
      const result=await request("/api/coach",{method:"POST",cookies:learnerCookies,data:{documentId,version:1,step:0,message:"simulate allowance"}});
      assert.equal(result.status,503);
      const resumed=await (await request("/api/session",{method:"POST",cookies:learnerCookies,data:{documentId}})).json();assert.equal(resumed.session.messages.length,4);
    });
    await t.test("repairs one failed source check and saves only the verified turn",async()=>{
      const result=await request("/api/coach",{method:"POST",cookies:learnerCookies,data:{documentId,version:1,step:0,message:"retry citation"}});
      assert.equal(result.status,200);
      const session=(await result.json()).session;
      assert.equal(session.messages.length,6);
      assert.equal(session.messages[4].content,"retry citation");
      assert.equal(session.messages[5].content,"Recovered a source-cited reply.");
      const guide=(await (await request(`/api/guidance/${documentId}`,{cookies:learnerCookies})).json()).document;
      const cite=session.messages[5].citations[0];
      assert.ok(guide.sections.find(s=>s.id===cite.sectionId).text.includes(cite.quote));
    });
    await t.test("resets walkthroughs for changed guidance and blocks stale editing",async()=>{
      const changed=await request(`/api/guidance/${documentId}`,{method:"PATCH",cookies:adminCookies,data:{version:1,content:"# Updated process\nCheck the request and record the contact details before passing the request to the approved team."}});assert.equal(changed.status,200);assert.equal((await changed.json()).document.version,2);
      const stale=await request(`/api/guidance/${documentId}`,{method:"PATCH",cookies:adminCookies,data:{version:1,title:"Stale change"}});assert.equal(stale.status,409);
      const resumed=await (await request("/api/session",{method:"POST",cookies:learnerCookies,data:{documentId}})).json();assert.equal(resumed.session.version,2);assert.equal(resumed.session.messages.length,0);
      assert.equal((await request("/api/coach",{method:"POST",cookies:learnerCookies,data:{documentId,version:1,step:0,message:"Explain"}})).status,409);
    });
    await t.test("unpublishes and deletes guidance including stored originals and sessions",async()=>{
      assert.equal((await request(`/api/guidance/${documentId}`,{method:"PATCH",cookies:adminCookies,data:{version:2,status:"draft"}})).status,200);
      assert.equal((await request(`/api/guidance/${documentId}/original`,{cookies:learnerCookies})).status,404);
      assert.equal((await request("/api/session",{method:"POST",cookies:learnerCookies,data:{documentId}})).status,404);
      assert.equal((await request(`/api/guidance/${documentId}`,{method:"DELETE",cookies:adminCookies})).status,200);
      assert.equal((await (await mf.getR2Bucket("BUCKET","guidance")).list()).objects.length,0);
      const row=await db.prepare("SELECT id FROM coach_sessions WHERE document_id = ?").bind(documentId).first();assert.equal(row,null);
    });
    await t.test("logout revokes access and keeps browser learner progress on the next login",async()=>{
      await request("/api/session",{method:"POST",cookies:learnerCookies,data:{documentId:"sample-callback"}});
      await request("/api/coach",{method:"POST",cookies:learnerCookies,data:{documentId:"sample-callback",version:1,step:0,message:"Explain this step"}});
      const oldCookies=learnerCookies;
      assert.equal((await request("/api/auth/logout",{method:"POST",cookies:oldCookies})).status,200);
      assert.equal((await request("/api/workspace",{cookies:oldCookies})).status,401);
      const signedIn=await request("/api/auth/login",{method:"POST",cookies:oldCookies,data:{role:"learner",password:learnerCode}});assert.equal(signedIn.status,200);learnerCookies=cookieJar(signedIn);
      const resumed=await (await request("/api/session",{method:"POST",cookies:learnerCookies,data:{documentId:"sample-callback"}})).json();assert.equal(resumed.session.messages.length,2);
      assert.equal((await (await request("/api/auth/me",{cookies:learnerCookies})).json()).admin,false);
    });
    await t.test("limits repeated sign-in attempts",async()=>{
      for(let i=0;i<10;i++)assert.equal((await request("/api/auth/login",{method:"POST",data:{role:"admin",password:"wrong"},headers:{"CF-Connecting-IP":"198.51.100.7"}})).status,401);
      assert.equal((await request("/api/auth/login",{method:"POST",data:{role:"admin",password:adminPassword},headers:{"CF-Connecting-IP":"198.51.100.7"}})).status,429);
    });
    await t.test("rotating the admin secret revokes old admin sessions and preserves learner sessions",async()=>{
      const newPassword="rotated-local-admin-password";
      await mf.setOptions({...options,workers:[{...options.workers[0],bindings:{...options.workers[0].bindings,ADMIN_PASSWORD:newPassword}},options.workers[1]]});
      assert.equal((await request("/api/workspace",{cookies:adminCookies})).status,401);
      assert.equal((await request("/api/workspace",{cookies:learnerCookies})).status,200);
      assert.equal((await request("/api/auth/login",{method:"POST",data:{role:"admin",password:adminPassword}})).status,401);
      assert.equal((await request("/api/auth/login",{method:"POST",data:{role:"admin",password:newPassword}})).status,200);
    });
  }finally{await mf.dispose();}
});
