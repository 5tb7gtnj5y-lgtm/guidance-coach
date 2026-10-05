import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const result=await build({entryPoints:['src/lib/progress.ts'],bundle:true,write:false,format:'esm',platform:'node'});
const {parseAssessment,summariseProgress}=await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
const sections=[{id:'one',title:'Check request',text:'Check the request and confirm the details with the person.'},{id:'two',title:'Record request',text:'Record the checked details using the approved route.'}];
const raw=(score=4,quote=sections[0].text)=>JSON.stringify({reply:'Check the details.',question:'',score:999,criteria:Object.fromEntries(['accuracy','application','reasoning'].map(name=>[name,{score,feedback:'Supported by the guidance.'}])),citations:[{sectionId:'one',quote}]});
test('assessment derives its total from validated criteria and authentic citations',()=>{
  assert.equal(parseAssessment(raw(),sections).score,100);
  assert.equal(parseAssessment(raw(0),sections).score,0);
  assert.equal(parseAssessment(raw(2),sections).passed,false);
  for(const value of [-1,5,1.5,'4'])assert.throws(()=>parseAssessment(raw(value),sections));
  assert.throws(()=>parseAssessment(raw(4,'A made-up quote that is not in the source.'),sections));
});
test('progress counts only scored passes for the current version and level',()=>{
  const row=(id,score,extra={})=>({id,user_id:'learner',document_id:'guide',version:1,level:'beginner',section_id:'one',section_title:'Check request',score,assessment:JSON.stringify(parseAssessment(raw(),sections)),created_at:Number(id),...extra});
  const rows=[row('1',80),row('2',30),row('3',100,{version:2}),row('4',100,{level:'advanced'}),row('5',100,{section_id:'removed'})];
  const p=summariseProgress(rows,sections,'beginner',1);
  assert.equal(p.attempts,2);assert.equal(p.completed,1);assert.equal(p.percent,50);assert.equal(p.averageScore,80);
  assert.equal(p.sections[0].latestScore,30);assert.equal(p.sections[1].bestScore,null);
  assert.deepEqual(p.history.map(a=>a.id),['2','1']);
  assert.equal(summariseProgress([],sections,'beginner',1).averageScore,null);
  assert.equal(summariseProgress([row('1',0)],sections,'beginner',1).averageScore,0);
});
