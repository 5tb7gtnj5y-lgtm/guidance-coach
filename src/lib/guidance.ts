export type Section = { id: string; title: string; text: string; page: number | null };
export type Guidance = { id: string; title: string; description: string; filename: string; format: string; status: string; version: number; sample: boolean; sections: Section[]; updatedAt: number; content?: string };
export type Citation = { sectionId: string; quote: string };
export type ChatMessage = { role: "user" | "assistant"; content: string; question?: string; citations?: Citation[]; at: number };
export type Session = { id: string; documentId: string; version: number; step: number; messages: ChatMessage[] };

export const sampleText = `# Handling a request for a call back
This is a fictional training guide. It is here to show how Guidance Coach works and is not an official procedure.

## 1. Understand the request
Ask the person what they need help with and whether they are asking for a call back. Let them finish explaining. Summarise the request in plain language and check that your summary is correct.
If the person reports an immediate risk to their safety, follow your organisation's emergency procedure. This guide does not describe that procedure.

## 2. Check the contact details
Ask for the person's preferred phone number and a suitable time to call. Read the phone number back and check it is correct. Ask whether it is safe to leave a message. Do not ask for passwords or bank details.
If the person does not have access to a phone, ask which alternative contact method they can use and record their preference.

## 3. Explain what will happen
Explain that you will pass the request to the relevant team. Do not promise a particular response time unless your team's published guidance gives one. This sample guide does not set a response time.
Check that the person understands the next step. If they are unsure, explain it again using different words.

## 4. Make a clear record
Record the reason for the call back, the checked contact number, preferred time, whether a message can be left, and any agreed alternative contact method. Use factual language. Do not include unrelated personal information.
Send the request through your team's approved route. This sample guide does not identify a system or inbox.

## 5. Close the conversation
Summarise what you have agreed. Ask whether the person has any other questions about the call back. Thank them and end the conversation politely.
If you cannot answer a question using this guide, check with your team or the owner of the guidance. Do not invent an answer.`;

export function splitGuidance(input: string): Section[] {
  const normalized = input.replace(/\r\n?/g, "\n").replace(/\u0000/g, "").trim();
  const sections: Section[] = [];
  let title = "Overview", page: number | null = null, lines: string[] = [];
  const flush = () => {
    const content = lines.join("\n").trim(); lines = [];
    if (!content) return;
    const paragraphs = content.split(/\n\s*\n/);
    let chunk = "", part = 0;
    const push = () => { if (!chunk.trim()) return; sections.push({id:`S${sections.length + 1}`,title: part ? `${title} (continued)` : title,text:chunk.trim(),page}); chunk=""; part++; };
    for (const paragraph of paragraphs) {
      for (let start=0;start<paragraph.length;start+=2200) {
        const bit=paragraph.slice(start,start+2200);
        if (chunk.length+bit.length>2600) push();
        chunk += (chunk ? "\n\n" : "")+bit;
      }
    }
    push();
  };
  for (const line of normalized.split("\n")) {
    const pageMatch=line.match(/^\[Page (\d+)\]$/);
    const heading=line.match(/^#{1,4}\s+(.+)$/) || (line.length<110 ? line.match(/^(\d+[.)]\s+.+)$/) : null);
    if(pageMatch){flush();page=Number(pageMatch[1]);title=`Page ${page}`;}
    else if(heading){flush();title=heading[1].trim();}
    else lines.push(line);
  }
  flush();
  return sections;
}

const stop = new Set("the a an is are was were it this that of to for in on and or with how what which can could do does i my me you your we would should please through help guidance guide explain section step next".split(" "));
export function tokens(text: string) { return [...new Set((text.toLowerCase().match(/[a-z0-9]{3,}/g)||[]).filter(t=>!stop.has(t)))]; }
export function retrieve(sections: Section[], question: string, step: number) {
  const words=tokens(question);
  const ranked=sections.map((s,i)=>({section:s,index:i,score:words.reduce((n,t)=>n+((s.title.toLowerCase().includes(t)?4:0)+(s.text.toLowerCase().includes(t)?1:0)),0)})).filter(r=>r.score>0).sort((a,b)=>b.score-a.score);
  const current=sections[Math.max(0,Math.min(step,sections.length-1))];
  return [current,...ranked.map(r=>r.section)].filter((s,i,all)=>s&&all.findIndex(t=>t.id===s.id)===i).slice(0,6);
}
export function parseCoachResponse(raw: string, allowed: Section[]) {
  let text=raw.trim().replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/,"");
  const start=text.indexOf("{"),end=text.lastIndexOf("}");
  if(start>=0&&end>start)text=text.slice(start,end+1);
  let parsed: Record<string,unknown>; try{parsed=JSON.parse(text);}catch{throw new Error("The coach could not produce a verified reply. Please try again.");}
  if(typeof parsed.reply!=="string"||!parsed.reply.trim()||parsed.reply.length>6000)throw new Error("The coach reply could not be verified. Please try again.");
  const citations: Citation[] = Array.isArray(parsed.citations) ? parsed.citations.filter((c: Citation)=>c&&typeof c.sectionId==="string"&&typeof c.quote==="string"&&c.quote.trim().length>=8&&c.quote.length<=500&&allowed.some(s=>s.id===c.sectionId&&s.text.includes(c.quote))).slice(0,4) : [];
  if(!citations.length)throw new Error("The coach could not verify its reply against the guidance. Please try again or read the source section.");
  return {content: parsed.reply.trim(),question: typeof parsed.question==="string"?parsed.question.slice(0,600):"",citations};
}
