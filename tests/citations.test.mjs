import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transform } from "esbuild";
const source=readFileSync(new URL("../src/lib/guidance.ts",import.meta.url),"utf8");
const compiled=await transform(source,{loader:"ts",format:"esm",target:"es2022"});
const {parseCoachResponse,verifiedCoachReply,CoachVerificationError}=await import(`data:text/javascript;base64,${Buffer.from(compiled.code).toString("base64")}`);
const section={id:"step-1",title:"Checks",page:3,text:'Check your\n\nlicence and the learner’s identity. Pay £20.50 within 14 days. Use form A+B (v2).'};
const response=(quote,sectionId=section.id)=>JSON.stringify({reply:"Check the requirements in the source.",question:"What would you check?",citations:[{sectionId,quote}]});

test("PDF whitespace and smart quotes match without changing the cited source",()=>{
  const parsed=parseCoachResponse(response("Check your licence and the learner's identity."),[section]);
  assert.equal(parsed.citations[0].quote,"Check your\n\nlicence and the learner’s identity.");
  assert.ok(section.text.includes(parsed.citations[0].quote));
  const other={...section,text:'Use\u00a0the “approved” route.'};
  assert.equal(parseCoachResponse(response('Use the "approved" route.'),[other]).citations[0].quote,other.text);
});

test("invented words, altered numbers, wrong sections and regex patterns remain rejected",()=>{
  for(const quote of ["Pay £20.50 within 15 days.","Skip the learner’s identity.","Check.*identity.","check your licence", "Use form A-B (v2)."]){
    assert.throws(()=>parseCoachResponse(response(quote),[section]),CoachVerificationError);
  }
  assert.throws(()=>parseCoachResponse(response("Check your\n\nlicence","wrong-section"),[section]),CoachVerificationError);
  assert.equal(parseCoachResponse(response("Use form A+B (v2)."),[section]).citations[0].quote,"Use form A+B (v2).");
});

test("malformed JSON and missing citations recover in one fresh generation",async()=>{
  for(const invalid of ["not JSON","null",response("Invented quotation."),JSON.stringify({reply:"Uncited reply."})]){
    const attempts=[];
    const reply=await verifiedCoachReply(async retry=>{attempts.push(retry);return retry?response("Pay £20.50 within 14 days."):invalid;},[section]);
    assert.deepEqual(attempts,[false,true]);
    assert.equal(reply.citations[0].quote,"Pay £20.50 within 14 days.");
  }
});

test("valid replies use one generation; two failed checks show a labelled source excerpt",async()=>{
  const attempts=[];
  await verifiedCoachReply(async retry=>{attempts.push(retry);return response("Pay £20.50 within 14 days.");},[section]);
  assert.deepEqual(attempts,[false]);
  attempts.length=0;
  const fallback=await verifiedCoachReply(async retry=>{attempts.push(retry);return response("Invented quotation.");},[section]);
  assert.deepEqual(attempts,[false,true]);
  assert.match(fallback.content,/couldn’t verify the generated explanation/);
  assert.ok(!fallback.content.includes("Invented quotation."));
  assert.equal(fallback.citations[0].quote,section.text);
  assert.ok(section.text.includes(fallback.citations[0].quote));
});

test("AI connection and allowance failures are not automatically retried",async()=>{
  let calls=0;
  const failure=new Error("AI allowance reached");
  await assert.rejects(verifiedCoachReply(async()=>{calls++;throw failure;},[section]),error=>error===failure);
  assert.equal(calls,1);
});
