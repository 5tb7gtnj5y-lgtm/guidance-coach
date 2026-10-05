import { parseCoachResponse, CoachVerificationError, type Section, type Citation } from './guidance';
export const levels = {
  beginner: {label:'Beginner',description:'Clear explanations and simple checks of understanding.',instruction:'Explain terms and give helpful prompts. Ask a short question about the key action and why it matters.'},
  intermediate: {label:'Intermediate',description:'Apply the guidance to realistic situations.',instruction:'Use realistic, clearly fictional practice situations. Ask the learner to choose an action and explain it using the guidance. Give fewer hints.'},
  advanced: {label:'Advanced',description:'Work through complex situations and explain decisions.',instruction:'Use complex fictional situations, competing considerations or exceptions ONLY where supported by the uploaded guidance. Ask for a reasoned decision, relevant checks and limits of the guidance. Do not invent exceptions or procedures.'},
} as const;
export type LearningLevel=keyof typeof levels;
export function validLevel(value:unknown):value is LearningLevel{return typeof value==='string'&&Object.hasOwn(levels,value);}
export const passScore=70;
export const criterionNames={accuracy:'Accuracy',application:'Applying the guidance',reasoning:'Explaining your decision'} as const;
export type Criterion=keyof typeof criterionNames;
export type Assessment={score:number;passed:boolean;feedback:string;criteria:Record<Criterion,{score:number;feedback:string}>;citations:Citation[]};
export type Attempt={id:string;sectionId:string;sectionTitle:string;score:number;at:number;assessment:Assessment};
export type Progress={level:LearningLevel;version:number;totalSections:number;completed:number;percent:number;averageScore:number|null;attempts:number;sections:{id:string;title:string;bestScore:number|null;latestScore:number|null;attempts:number;completed:boolean}[];history:Attempt[]};
export type LearnerReport={learner:string;documentId:string;title:string;level:LearningLevel;completed:number;totalSections:number;averageScore:number|null;attempts:number;lastAt:number};
export type AttemptRow={id:string;user_id:string;document_id:string;version:number;level:LearningLevel;section_id:string;section_title:string;score:number;assessment:string;created_at:number};
export function parseAssessment(raw:string,sections:Section[]):Assessment{
  const verified=parseCoachResponse(raw,sections);
  let text=raw.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
  const start=text.indexOf('{'),end=text.lastIndexOf('}');if(start>=0&&end>start)text=text.slice(start,end+1);
  const parsed=JSON.parse(text);
  const criteria={} as Assessment['criteria'];
  for(const name of Object.keys(criterionNames) as Criterion[]){
    const value=parsed.criteria?.[name];
    if(!value||!Number.isInteger(value.score)||value.score<0||value.score>4||typeof value.feedback!=='string'||!value.feedback.trim()||value.feedback.length>700)throw new CoachVerificationError('The coach could not verify this score. Please try again.');
    criteria[name]={score:value.score,feedback:value.feedback.trim()};
  }
  const score=Math.round(Object.values(criteria).reduce((n,c)=>n+c.score,0)/12*100);
  return {score,passed:score>=passScore,feedback:verified.content,criteria,citations:verified.citations};
}
export function summariseProgress(rows:AttemptRow[],sections:Section[],level:LearningLevel,version:number):Progress{
  const relevant=rows.filter(r=>r.level===level&&r.version===version&&sections.some(s=>s.id===r.section_id)).sort((a,b)=>b.created_at-a.created_at||b.id.localeCompare(a.id));
  const sectionScores=sections.map(s=>{
    const attempts=relevant.filter(r=>r.section_id===s.id),best=attempts.length?Math.max(...attempts.map(r=>r.score)):null;
    return {id:s.id,title:s.title,bestScore:best,latestScore:attempts[0]?.score??null,attempts:attempts.length,completed:best!==null&&best>=passScore};
  });
  const scored=sectionScores.filter(s=>s.bestScore!==null),completed=sectionScores.filter(s=>s.completed).length;
  return {level,version,totalSections:sections.length,completed,percent:sections.length?Math.round(completed/sections.length*100):0,averageScore:scored.length?Math.round(scored.reduce((n,s)=>n+s.bestScore!,0)/scored.length):null,attempts:relevant.length,sections:sectionScores,history:relevant.slice(0,20).map(r=>({id:r.id,sectionId:r.section_id,sectionTitle:r.section_title,score:r.score,at:r.created_at,assessment:JSON.parse(r.assessment)}))};
}
