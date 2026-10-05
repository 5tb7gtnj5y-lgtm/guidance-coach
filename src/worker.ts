import { handleAPI } from "./lib/server";
import { handleAuth, type AuthRuntime } from "./auth";
type Runtime=AuthRuntime&{BUCKET?:R2Bucket;AI?:unknown;ASSETS?:Fetcher};
const security={"X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer","Permissions-Policy":"camera=(), microphone=(self), geolocation=()","Content-Security-Policy":"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"};
export default {
  async fetch(req:Request,env:Runtime):Promise<Response>{
    const path=new URL(req.url).pathname;let response:Response;
    if(path==="/api/health"){
      let databaseReady=false;try{if(env.DB){await env.DB.prepare("SELECT id FROM guidance LIMIT 1").first();await env.DB.prepare("SELECT token_hash FROM auth_sessions LIMIT 1").first();await env.DB.prepare("SELECT id FROM learning_attempts LIMIT 1").first();await env.DB.prepare("SELECT level FROM coach_sessions LIMIT 1").first();databaseReady=true;}}catch{}
      const adminConfigured=!!env.ADMIN_PASSWORD&&env.ADMIN_PASSWORD.length>=12,learnerConfigured=!!env.LEARNER_ACCESS_CODE&&env.LEARNER_ACCESS_CODE.length>=8;
      response=Response.json({status:databaseReady&&env.BUCKET&&env.AI&&adminConfigured&&learnerConfigured?"ready":"setup-required",databaseReady,storageBinding:!!env.BUCKET,aiBinding:!!env.AI,adminConfigured,learnerConfigured,version:"1.0.0"},{headers:{"Cache-Control":"no-store"}});
    }else if(path.startsWith("/api/auth/"))response=await handleAuth(req,env);
    else if(path.startsWith("/api/"))response=await handleAPI(req);
    else if(env.ASSETS)response=await env.ASSETS.fetch(req);
    else response=new Response("The website build is missing.",{status:503});
    const headers=new Headers(response.headers);for(const [key,value]of Object.entries(security))headers.set(key,value);
    return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
  },
};
