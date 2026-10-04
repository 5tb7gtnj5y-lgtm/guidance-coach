import { AppError } from "./errors";
export type AuthRuntime={DB?:D1Database;ADMIN_PASSWORD?:string;LEARNER_ACCESS_CODE?:string};
export type Identity={id:string;email:string;admin:boolean};
type LoginSession={token_hash:string;user_id:string;role:string;credential_hash:string;expires_at:number};
const sessionDays=30;
const reply=(data:unknown,status=200,headers:HeadersInit={})=>Response.json(data,{status,headers:{"Cache-Control":"private, no-store",...headers}});
function db(env:AuthRuntime){if(!env.DB)throw new AppError("The workspace is waiting for its administrator to finish setup.",503);return env.DB;}
function cookieNames(req:Request){const secure=new URL(req.url).protocol==="https:";return {session:secure?"__Host-guidance_session":"guidance_session",device:secure?"__Host-guidance_device":"guidance_device",secure};}
function cookies(req:Request){return Object.fromEntries((req.headers.get("cookie")||"").split(";").map(s=>s.trim().split("=")).filter(p=>p.length===2));}
function cookie(req:Request,name:string,value:string,seconds:number){return `${name}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${seconds}${cookieNames(req).secure?"; Secure":""}`;}
async function hash(value:string){const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));return Array.from(new Uint8Array(bytes)).map(b=>b.toString(16).padStart(2,"0")).join("");}
function random(){const bytes=crypto.getRandomValues(new Uint8Array(32));return Array.from(bytes).map(b=>b.toString(16).padStart(2,"0")).join("");}
function secret(env:AuthRuntime,role:string){return role==="admin"?env.ADMIN_PASSWORD:env.LEARNER_ACCESS_CODE;}
async function equalPassword(input:string,wanted:string){const [a,b]=await Promise.all([hash(input),hash(wanted)]);let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;}
function sameOrigin(req:Request){if(req.headers.get("origin")!==new URL(req.url).origin||req.headers.get("sec-fetch-site")==="cross-site")throw new AppError("Refresh this page before trying again.",403);}
export async function optionalIdentity(req:Request,env:AuthRuntime):Promise<Identity|null>{
  const token=cookies(req)[cookieNames(req).session];if(!token||!/^\w{64}$/.test(token))return null;
  const row=await db(env).prepare("SELECT * FROM auth_sessions WHERE token_hash = ? AND expires_at > ?").bind(await hash(token),Date.now()).first<LoginSession>();
  if(!row||!["admin","learner"].includes(row.role))return null;
  const current=secret(env,row.role);if(!current||await hash(`${row.role}:${current}`)!==row.credential_hash)return null;
  return {id:row.user_id,email:row.role==="admin"?"Administrator":"Learner",admin:row.role==="admin"};
}
export async function requireIdentity(req:Request,env:AuthRuntime){const user=await optionalIdentity(req,env);if(!user)throw new AppError("Sign in to open your guidance workspace.",401);return user;}
async function loginLimit(req:Request,env:AuthRuntime){
  const key="login:"+await hash(req.headers.get("CF-Connecting-IP")||"local"),window=Math.floor(Date.now()/60000);
  await db(env).prepare("INSERT INTO rate_windows (user_id,window,count) VALUES (?,?,1) ON CONFLICT(user_id) DO UPDATE SET window = excluded.window, count = CASE WHEN rate_windows.window = excluded.window THEN rate_windows.count + 1 ELSE 1 END").bind(key,window).run();
  const row=await db(env).prepare("SELECT count FROM rate_windows WHERE user_id = ?").bind(key).first<{count:number}>();if((row?.count||0)>10)throw new AppError("Too many sign-in attempts. Wait a minute and try again.",429);
}
export async function handleAuth(req:Request,env:AuthRuntime){
  try{
    const path=new URL(req.url).pathname;
    if(path==="/api/auth/me"&&req.method==="GET"){
      const user=await optionalIdentity(req,env);return reply({authenticated:!!user,admin:user?.admin||false,adminConfigured:!!env.ADMIN_PASSWORD&&env.ADMIN_PASSWORD.length>=12,learnerConfigured:!!env.LEARNER_ACCESS_CODE&&env.LEARNER_ACCESS_CODE.length>=8});
    }
    if(path==="/api/auth/login"&&req.method==="POST"){
      sameOrigin(req);await loginLimit(req,env);
      if(!req.headers.get("content-type")?.includes("application/json"))throw new AppError("Enter your sign-in details.");
      const raw=await req.text();if(raw.length>1024)throw new AppError("The sign-in request is too large.",413);
      let data:{role?:unknown;password?:unknown};try{data=JSON.parse(raw);}catch{throw new AppError("Enter your sign-in details.");}
      if(!["admin","learner"].includes(String(data.role))||typeof data.password!=="string"||data.password.length>256)throw new AppError("Enter your password or access code.");
      const role=String(data.role),wanted=secret(env,role);
      if(!wanted||wanted.length<(role==="admin"?12:8))throw new AppError("This workspace is waiting for its administrator to finish setup.",503);
      if(!await equalPassword(data.password,wanted))throw new AppError(role==="admin"?"The admin password is incorrect.":"The learner access code is incorrect.",401);
      const names=cookieNames(req),values=cookies(req);const device=/^[a-f0-9]{64}$/.test(values[names.device]||"")?values[names.device]:random();
      const token=random(),now=Date.now(),userId=role==="admin"?"admin":await hash(`learner:${device}`),credentialHash=await hash(`${role}:${wanted}`);
      const statements=[db(env).prepare("DELETE FROM auth_sessions WHERE expires_at <= ?").bind(now),db(env).prepare("INSERT INTO auth_sessions (token_hash,user_id,role,credential_hash,expires_at) VALUES (?,?,?,?,?)").bind(await hash(token),userId,role,credentialHash,now+sessionDays*86400000)];
      const old=values[names.session];if(old)statements.unshift(db(env).prepare("DELETE FROM auth_sessions WHERE token_hash = ?").bind(await hash(old)));
      await db(env).batch(statements);
      const response=reply({authenticated:true,admin:role==="admin"});response.headers.append("Set-Cookie",cookie(req,names.session,token,sessionDays*86400));response.headers.append("Set-Cookie",cookie(req,names.device,device,180*86400));return response;
    }
    if(path==="/api/auth/logout"&&req.method==="POST"){
      sameOrigin(req);const names=cookieNames(req),token=cookies(req)[names.session];if(token)await db(env).prepare("DELETE FROM auth_sessions WHERE token_hash = ?").bind(await hash(token)).run();
      return reply({authenticated:false},200,{"Set-Cookie":cookie(req,names.session,"",0)});
    }
    throw new AppError("This page could not be found.",404);
  }catch(error){if(error instanceof AppError)return reply({error:error.message},error.status);console.error("Sign-in failed",error instanceof Error?error.name:"unknown");return reply({error:"Sign-in is temporarily unavailable. Please try again."},503);}
}
