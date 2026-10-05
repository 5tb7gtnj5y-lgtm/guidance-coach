"use client";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { BookOpen, MessageCircle, Upload, FileText, ShieldCheck, Check, X, Download, Plus, LoaderCircle, Eye, Trash2, CheckCircle2, Mic, Volume2, Square, Bot, Headphones, Sparkles, ArrowUp, ChevronRight } from "lucide-react";
import { splitGuidance, type Guidance, type Section, type Session, type Citation, type ChatMessage } from "@/lib/guidance";
import { levels, type LearningLevel, type Progress } from "@/lib/progress";
import { LearningProgress, LearnerProgressReport, SessionResults } from "./LearningProgress";
import { extractFile } from "@/lib/extract";
import { useVoice } from "@/lib/useVoice";

async function api<T>(path:string,options:RequestInit={}):Promise<T>{
  const result=await fetch(`/api/${path}`,options),data=await result.json() as T & {error?:string};
  if(!result.ok)throw new Error(data.error||"The request could not be completed. Please try again.");return data;
}
const json=(data:unknown)=>({method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(data)});
const replyMode=(session:Session):"answer"|"ask"=>{const reply=session.messages.at(-1);return !session.finishedAt&&reply?.question&&reply.assessmentEligible?"answer":"ask";};
type WorkspaceData={admin:boolean;email:string;documents:Guidance[];aiConfigured:boolean};
function SourceText({section,quote}:{section:Section;quote:string}){if(!quote||!section.text.includes(quote))return <p className="source-text">{section.text}</p>;const i=section.text.indexOf(quote);return <p className="source-text">{section.text.slice(0,i)}<mark>{quote}</mark>{section.text.slice(i+quote.length)}</p>;}
function CoachMessage({message,onSource,sections}:{message:ChatMessage;onSource:(citation:Citation)=>void;sections:Section[]}){
  const citations=message.citations||[];
  return <article className={`chat-message ${message.role}`}><div className="message-byline">{message.role==="assistant"?"Guidance coach":"You"}</div><div className="message-content"><p>{message.content}</p>{message.question&&<div className="coach-question"><p>{message.question}</p></div>}{citations.length===1&&<button className="text-button source-link" onClick={()=>onSource(citations[0])}><BookOpen size={16}/>View the source</button>}{citations.length>1&&<details className="source-references"><summary>View sources ({citations.length})</summary><div>{citations.map((citation,index)=><button key={index} className="text-button source-link" onClick={()=>onSource(citation)}><BookOpen size={16}/>{sections.find(s=>s.id===citation.sectionId)?.title||`Source ${index+1}`}</button>)}</div></details>}</div></article>;
}

export default function Workspace({onSignOut}:{onSignOut:()=>void}){
  const [data,setData]=useState<WorkspaceData|null>(null),[docs,setDocs]=useState<Guidance[]>([]),[selected,setSelected]=useState<Guidance|null>(null);
  const [view,setView]=useState<"learn"|"admin">("learn"),[session,setSession]=useState<Session|null>(null),[source,setSource]=useState(0),[quote,setQuote]=useState("");
  const [input,setInput]=useState(""),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(""),[notice,setNotice]=useState(""),[workspaceTab,setWorkspaceTab]=useState("coach");
  const [editor,setEditor]=useState(false),[editing,setEditing]=useState<Guidance|null>(null),[title,setTitle]=useState(""),[description,setDescription]=useState(""),[text,setText]=useState(""),[file,setFile]=useState<File|null>(null),[extracting,setExtracting]=useState(false),[deleteTarget,setDeleteTarget]=useState<Guidance|null>(null),[restart,setRestart]=useState(false);
  const [interactionMode,setInteractionMode]=useState<"chat"|"voice">("chat");
  const [results,setResults]=useState<Progress|null>(null);
  const [progress,setProgress]=useState<Progress|null>(null),[answerMode,setAnswerMode]=useState<"answer"|"ask">("ask");
  const messagesEnd=useRef<HTMLDivElement>(null),fileInput=useRef<HTMLInputElement>(null),dialogRef=useRef<HTMLDialogElement>(null),confirmRef=useRef<HTMLDialogElement>(null),loadSequence=useRef(0),busyRef=useRef(false),sourceSelectRef=useRef<HTMLSelectElement>(null),composerRef=useRef<HTMLTextAreaElement>(null);
  const voice=useVoice(setInput,view==="learn"&&!!session&&!loading,busy);
  const published=useMemo(()=>docs.filter(d=>d.status==="published"),[docs]);
  const choose=useCallback(async (doc:Guidance,level?:LearningLevel)=>{
    voice.cancel();
    const seq=++loadSequence.current;setSelected(doc);setSource(0);setQuote("");setSession(null);setProgress(null);setResults(null);setError("");setInput("");setWorkspaceTab("coach");
    if(doc.status!=="published")return;
    setLoading(true);
    try{const result=await api<{session:Session;results:Progress|null}>("session",json({documentId:doc.id,...(level?{level}:{})}));
      const scores=await api<{progress:Progress}>(`progress?documentId=${encodeURIComponent(doc.id)}&level=${result.session.level}`);
      if(seq===loadSequence.current){setSession(result.session);setAnswerMode(replyMode(result.session));setResults(result.results);setSource(result.session.step);setProgress(scores.progress);}}
    catch(e){if(seq===loadSequence.current)setError((e as Error).message);}finally{if(seq===loadSequence.current)setLoading(false);}
  },[voice.cancel]);
  const refresh=useCallback(async (admin=false,keepId?:string)=>{
    const result=await api<WorkspaceData>(`workspace${admin?"?admin=1":""}`);setData(result);setDocs(result.documents);
    if(!admin){const doc=result.documents.find(d=>d.id===keepId)||result.documents.find(d=>!d.sample)||result.documents[0];if(doc)await choose(doc);else{setSelected(null);setSession(null);}}
    return result;
  },[choose]);
  useEffect(()=>{refresh().catch(e=>setError(e.message)).finally(()=>setLoading(false));},[refresh]);
  useEffect(()=>{messagesEnd.current?.scrollIntoView({block:"nearest",behavior:"smooth"});},[session?.messages.length,busy]);
  useEffect(()=>{const dialog=dialogRef.current;if(editor&&!dialog?.open)dialog?.showModal();if(!editor&&dialog?.open)dialog.close();},[editor]);
  useEffect(()=>{const dialog=confirmRef.current;if((deleteTarget||restart)&&!dialog?.open)dialog?.showModal();if(!deleteTarget&&!restart&&dialog?.open)dialog.close();},[deleteTarget,restart]);
  useEffect(()=>{if(workspaceTab==="source")sourceSelectRef.current?.focus();else composerRef.current?.focus();},[workspaceTab]);
  const send=useCallback(async (message:string,step?:number)=>{
    if(!selected||!session||busyRef.current||voice.state.listening||!message.trim())return null;
    voice.cancel();
    busyRef.current=true;setBusy(true);setError("");
    try{const result=await api<{session:Session}>("coach",json({documentId:selected.id,version:selected.version,message:message.trim(),step:step??session.step,level:session.level}));setSession(result.session);setAnswerMode(replyMode(result.session));setSource(result.session.step);setQuote("");setInput(draft=>draft.trim()===message.trim()?"":draft);const reply=result.session.messages.at(-1);if(reply?.role==="assistant")voice.readNewReply([reply.content,reply.question].filter(Boolean).join("\n"));return result.session;}
    catch(e){setError((e as Error).message);throw e;}finally{busyRef.current=false;setBusy(false);}
  },[selected,session,voice.cancel,voice.readNewReply,voice.state.listening]);
  const safelySend=(message:string,step?:number)=>void send(message,step).catch(()=>{});
  const switchView=async(next:"learn"|"admin")=>{if(busy||extracting)return;voice.cancel();setView(next);setError("");setNotice("");setLoading(true);try{await refresh(next==="admin",selected?.id);}catch(e){setError((e as Error).message);}finally{setLoading(false);}};
  const openEditor=(doc:Guidance|null=null)=>{setEditing(doc);setTitle(doc?.title||"");setDescription(doc?.description||"");setText(doc?.content||"");setFile(null);setError("");setNotice("");setEditor(true);};
  const loadFile=async(chosen:File)=>{if(extracting)return;setExtracting(true);setError("");try{const content=await extractFile(chosen);setFile(chosen);setText(content);if(!title)setTitle(chosen.name.replace(/\.[^.]+$/,"").replace(/[-_]/g," "));}catch(e){setError((e as Error).message);}finally{setExtracting(false);if(fileInput.current)fileInput.current.value="";}};
  const save=async()=>{if(busyRef.current||extracting)return;busyRef.current=true;setBusy(true);setError("");try{
    let result:{document:Guidance};
    if(editing){result=await api(`guidance/${editing.id}`,{...json({title,description,content:text,version:editing.version}),method:"PATCH"});}
    else{const body=new FormData();body.set("title",title);body.set("description",description);body.set("content",text);if(file)body.set("file",file);result=await api("guidance",{method:"POST",body});}
    setEditor(false);setNotice(editing?"Guidance updated.":"Guidance saved as a draft. Publish it when you are ready.");await refresh(true);return result.document;
  }catch(e){setError((e as Error).message);}finally{busyRef.current=false;setBusy(false);}};
  const publish=async(doc:Guidance)=>{setBusy(true);setError("");try{await api(`guidance/${doc.id}`,{...json({status:doc.status==="published"?"draft":"published",version:doc.version}),method:"PATCH"});await refresh(true);setNotice(doc.status==="published"?"Guidance unpublished. It is now visible only in Admin.":"Guidance published. Learners can now work through it.");}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
  const confirmAction=async()=>{voice.cancel();setBusy(true);setError("");try{if(deleteTarget){await api(`guidance/${deleteTarget.id}`,{method:"DELETE"});setDeleteTarget(null);setNotice("Guidance deleted.");await refresh(true);}else if(restart&&selected){const result=await api<{session:Session}>("session",json({documentId:selected.id,reset:true,level:session?.level}));setSession(result.session);setAnswerMode(replyMode(result.session));setResults(null);setInput("");setSource(0);setQuote("");setRestart(false);}}catch(e){setError((e as Error).message);setDeleteTarget(null);setRestart(false);}finally{setBusy(false);}};
  const showCitation=(citation:Citation)=>{if(!selected)return;voice.cancel();const i=selected.sections.findIndex(s=>s.id===citation.sectionId);if(i<0)return;setSource(i);setQuote(citation.quote);setWorkspaceTab("source");};
  const current=selected?.sections[session?.step||0],sourceSection=selected?.sections[source];
  const latestIndex=session?session.messages.map(m=>m.role).lastIndexOf("assistant"):-1;
  const latestReply=session?.messages[latestIndex];
  const canAnswer=!!latestReply?.question&&!!latestReply.assessmentEligible&&!session?.finishedAt&&latestReply.step===session?.step&&latestReply.level===session?.level;
  const submitAnswer=async()=>{
    if(!selected||!session||!canAnswer||busyRef.current||voice.state.listening||!input.trim())return;
    const answer=input.trim();voice.cancel();busyRef.current=true;setBusy(true);setError("");
    try{
      const result=await api<{session:Session;progress:Progress}>("assessment",json({documentId:selected.id,version:selected.version,level:session.level,sessionId:session.id,questionAt:latestReply!.at,answer}));
      setSession(result.session);setAnswerMode(replyMode(result.session));setProgress(result.progress);setInput(draft=>draft.trim()===answer?"":draft);
      const reply=result.session.messages.at(-1);if(reply)voice.readNewReply([reply.content,reply.question].filter(Boolean).join("\n"));
    }catch(e){setError((e as Error).message);}finally{busyRef.current=false;setBusy(false);}
  };
  const finishSession=async()=>{
    if(!selected||!session||busyRef.current||voice.state.listening||input.trim())return;
    voice.cancel();busyRef.current=true;setBusy(true);setError("");
    try{
      const result=await api<{session:Session;results:Progress}>("session/end",json({documentId:selected.id,version:selected.version,level:session.level,sessionId:session.id,lastMessageAt:session.messages.at(-1)?.at}));
      setSession(result.session);setAnswerMode(replyMode(result.session));setResults(result.results);setWorkspaceTab("coach");
    }catch(e){setError((e as Error).message);}finally{busyRef.current=false;setBusy(false);}
  };
  const submit=()=>{if(answerMode==="answer"&&canAnswer)void submitAnswer();else safelySend(input);};
  const previewSections=useMemo(()=>text.trim()?splitGuidance(text):[],[text]);

  return <div className={`app-shell caisy-workspace ${view==="learn"?"simple-learning":"simple-admin"}`}>
    <a href="#main" className="skip-link">Skip to guidance workspace</a>
    <header className="topbar"><a className="brand" href="/"><span className="brand-mark"><BookOpen size={24}/></span><span>Guidance<span className="brand-light">Coach</span></span></a><nav aria-label="Main navigation"><button className={view==="learn"?"nav-active":""} onClick={()=>switchView("learn")} disabled={busy}><MessageCircle size={18}/>Learn</button>{data?.admin&&<button className={view==="admin"?"nav-active":""} onClick={()=>switchView("admin")} disabled={busy}><ShieldCheck size={18}/>Admin</button>}</nav><button className="signout-button" onClick={()=>{voice.cancel();onSignOut();}} disabled={busy||extracting}>Sign out</button></header>
    <main id="main">
    <div className="page-heading"><div><h1>{view==="admin"?"Guidance library":"Your practice space"}</h1></div></div>
    {!editor&&error&&<div className="alert error" role="alert">{error}<button className="text-button" onClick={()=>{voice.cancel();setError("");setLoading(true);refresh(view==="admin",selected?.id).catch(e=>setError(e.message)).finally(()=>setLoading(false));}}>Reload workspace</button></div>}
    {notice&&<div className="alert success" role="status"><CheckCircle2 size={18}/>{notice}<button aria-label="Dismiss notification" onClick={()=>setNotice("")}><X size={16}/></button></div>}
    {view==="admin"?<>
      <div className="admin-toolbar"><p>Upload, check and publish the guidance your learners will use.</p><button className="primary" onClick={()=>openEditor()}><Plus size={18}/>Add guidance</button></div>
      <LearnerProgressReport/>
      {loading?<div className="empty-state"><LoaderCircle className="spin"/>Loading your guidance…</div>:<div className="admin-grid">{docs.map(doc=><article className="guide-card" key={doc.id}><div className="card-top"><span className="file-icon"><FileText size={24}/></span><span className={`status-pill ${doc.status}`}>{doc.status==="published"?"Published":"Draft"}</span></div><h2>{doc.title}</h2><p>{doc.description||"No description added."}</p><div className="card-meta">{doc.format} · {doc.sections.length} sections · Version {doc.version}{doc.sample&&" · Sample"}</div><div className="card-actions"><button className="secondary" onClick={()=>openEditor(doc)} disabled={busy}><Eye size={16}/>Review & edit</button><button className={doc.status==="published"?"text-button":"primary small"} onClick={()=>publish(doc)} disabled={busy}>{doc.status==="published"?"Unpublish":"Publish"}</button>{!doc.sample&&<button className="icon-button delete-button" title="Delete guidance" aria-label={`Delete ${doc.title}`} onClick={()=>setDeleteTarget(doc)} disabled={busy}><Trash2 size={17}/></button>}</div></article>)}</div>}
    </>:<div className="learning-workspace">
      <aside className="session-setup" aria-label="Practice setup"><div className="panel-heading"><span className="panel-kicker">GET READY</span><h2>Your session</h2><p>A little practice. More confidence.</p></div>
      <div className="guide-picker">
        <label htmlFor="learning-guide"><span className="setup-number">1</span>Choose your guidance</label>
        <select id="learning-guide" value={selected?.id||""} disabled={busy||loading||!published.length} onChange={e=>{const doc=published.find(d=>d.id===e.target.value);if(doc)void choose(doc);}}>
          {!published.length&&<option value="">No guidance available</option>}
          {published.map(doc=><option key={doc.id} value={doc.id}>{doc.title}{doc.sample?" (sample)":""}</option>)}
        </select>
      </div>
      {selected&&session&&<div className="level-picker"><label htmlFor="learning-level"><span className="setup-number">2</span>Choose your level</label><select id="learning-level" value={session.level} disabled={busy||loading||voice.state.listening||!!input.trim()} onChange={e=>void choose(selected,e.target.value as LearningLevel)}>{(Object.keys(levels) as LearningLevel[]).map(level=><option key={level} value={level}>{levels[level].label}</option>)}</select><p className="small-note">{levels[session.level].description}{input.trim()?" Send or clear your text to change level.":""}</p></div>}
      <div className="session-roadmap"><p className="panel-kicker">HOW IT WORKS</p><ol><li><span>01</span>Choose your guide and level</li><li><span>02</span>Chat, explore and practise</li><li><span>03</span>Finish to see your feedback</li></ol></div>
      {session&&<div className="session-status"><span className={`status-dot ${session.finishedAt?"complete":""}`}/>{session.finishedAt?"Session complete":session.messages.length?"Session in progress":"Ready when you are"}</div>}
      <p className="setup-note"><ShieldCheck size={16}/>Your progress is saved as you go.</p>
      </aside>
      <section className="learning-card" aria-label="Guidance learning workspace">
        {selected&&current&&<header className="lesson-heading"><p className="step-count">{workspaceTab==="coach"?(session?.finishedAt?"SESSION COMPLETE":`Step ${(session?.step||0)+1} of ${selected.sections.length}`):"Source guidance"}</p><h2>{workspaceTab==="coach"?current.title:selected.title}</h2><div hidden={workspaceTab!=="coach"} className="progress-track" role="progressbar" aria-label="Current walkthrough section" aria-valuemin={0} aria-valuemax={selected.sections.length} aria-valuenow={(session?.step||0)+1}><span style={{width:`${((session?.step||0)+1)/selected.sections.length*100}%`}}/></div></header>}
        {selected&&<div className="workspace-switch" role="group" aria-label="Learning view"><button aria-pressed={workspaceTab==="coach"} onClick={()=>{voice.cancel();setWorkspaceTab("coach");}}>Coach</button><button aria-pressed={workspaceTab==="source"} onClick={()=>{voice.cancel();setSource(session?.step||0);setQuote("");setWorkspaceTab("source");}}>Read guidance</button></div>}
        {selected&&!session?.finishedAt&&workspaceTab==="coach"&&<div className={`coach-presence ${voice.state.listening?"is-listening":voice.state.speaking?"is-speaking":""}`}><div className="coach-avatar" aria-hidden="true"><Bot size={38}/></div><div><p className="panel-kicker">YOUR AI COACH</p><h3>Let’s work through it together</h3><p className="coach-status" role="status">{busy?"Thinking through your guidance…":voice.state.listening?"Listening — take your time":voice.state.speaking?"Talking you through it":interactionMode==="voice"?"Press Talk to speak. Review your words, then Send.":"A safe space to ask questions and practise."}</p></div><div className="conversation-mode" role="group" aria-label="Conversation mode"><button aria-pressed={interactionMode==="chat"} disabled={busy||loading} onClick={()=>{voice.cancel();voice.toggleAuto(false);setInteractionMode("chat");}}><MessageCircle size={16}/>Chat</button><button aria-pressed={interactionMode==="voice"} disabled={busy||loading||(!voice.state.inputSupported&&!voice.state.outputSupported)} onClick={()=>{voice.cancel();voice.toggleAuto(true);setInteractionMode("voice");}}><Headphones size={16}/>Voice</button></div></div>}
        <div className="lesson-body" hidden={workspaceTab!=="coach"||!!session?.finishedAt}>
          {loading?<div className="empty-state"><LoaderCircle className="spin"/><p>Opening your guidance…</p></div>:!selected?<div className="empty-state"><BookOpen size={36}/><h2>No guidance published yet</h2><p>{data?.admin?"Add and publish guidance in Admin to begin.":"Your administrator will publish guidance here."}</p>{data?.admin&&<button className="primary" onClick={()=>switchView("admin")}>Open Admin</button>}</div>:!session?<div className="empty-state"><p>Your guidance could not be opened.</p><button className="secondary" onClick={()=>void choose(selected)}>Try again</button></div>:<>
            {!session.messages.length?<div className="welcome-message"><h3>Ready to begin?</h3><p>The coach will explain each step and help you practise. Ask questions as you go; your results appear when you finish the session.</p>{selected.sample&&<p className="sample-note">This is a fictional sample guide.</p>}<button className="primary" disabled={busy||voice.state.listening} onClick={()=>safelySend("Start a walkthrough of the current section. Explain what I need to do, then ask me one question about applying it.")}>Start walkthrough</button></div>:<>
              <div className="current-reply" role="log" aria-live="polite" aria-label="Current coaching reply" aria-busy={busy}>{latestReply&&<CoachMessage message={latestReply} onSource={showCitation} sections={selected.sections}/>}</div>
              {latestReply?.assessment&&!latestReply.question&&<button className="secondary small" disabled={busy||voice.state.listening||!!input.trim()} onClick={()=>safelySend("Ask a new practice question for this section at my learning level. Use the guidance and let me answer before giving feedback.")}>Continue practising</button>}
              <div className="reply-tools"><button className="text-button" disabled={!latestReply||!voice.state.outputSupported||busy||loading} onClick={()=>voice.read([latestReply?.content,latestReply?.question].filter(Boolean).join("\n"))}><Volume2 size={16}/>Read reply</button>{voice.state.speaking&&<button className="text-button" onClick={voice.stop}><Square size={14}/>Stop reading</button>}<details className="extra-help"><summary>More help</summary><div><button className="secondary small" disabled={busy||voice.state.listening} onClick={()=>safelySend("Explain this current section more simply and stay with this step.")}>Explain simply</button><button className="secondary small" disabled={busy||voice.state.listening} onClick={()=>safelySend("Give me a clearly labelled fictional practice example for this current section.")}>Give an example</button></div></details></div>
            </>}
            {busy&&<p className="thinking" role="status"><LoaderCircle size={16} className="spin"/>Checking your guidance…</p>}
            <div ref={messagesEnd}/>
          </>}
          {selected&&session&&<div className="simple-composer">
            <form onSubmit={e=>{e.preventDefault();submit();}}>
              {canAnswer&&<div className="answer-mode" role="group" aria-label="Message type"><button type="button" aria-pressed={answerMode==="answer"} disabled={busy} onClick={()=>setAnswerMode("answer")}>Answer</button><button type="button" aria-pressed={answerMode==="ask"} disabled={busy} onClick={()=>setAnswerMode("ask")}>Ask a question</button></div>}
              <label htmlFor="coach-message">Your message</label>
              <textarea ref={composerRef} id="coach-message" value={input} maxLength={1800} onChange={e=>setInput(e.target.value)} placeholder={interactionMode==="voice"?"Your words appear here. Check them, then Send…":"Share your answer, or ask for a little help…"} disabled={busy||loading} readOnly={voice.state.listening} rows={3} onKeyDown={e=>{if(e.key==="Enter"&&(e.ctrlKey||e.metaKey)){e.preventDefault();submit();}}}/>
              <div className="answer-actions"><button className={`secondary ${voice.state.listening?"listening":""}`} type="button" aria-pressed={voice.state.listening} disabled={!voice.state.inputSupported||busy||loading||voice.state.stopping} onClick={()=>voice.talk(input)}>{voice.state.listening?<Square size={16}/>:<Mic size={16}/>} {voice.state.stopping?"Finishing…":voice.state.listening?"Stop listening":"Talk"}</button><span className="dictation-hint">{voice.state.listening?"Speak, then stop and check your words.":"Check your words before sending."}</span><button className="primary" type="submit" disabled={!input.trim()||busy||loading||voice.state.listening} aria-label="Send your message"><ArrowUp size={16}/>Send</button></div>
            </form>
            {voice.notice.text&&<p className={`voice-status ${voice.notice.error?"voice-error":""}`} role="status">{voice.notice.text}</p>}
            {!voice.state.inputSupported&&<p className="small-note">Talk is unavailable in this browser. You can type or use keyboard dictation.</p>}
            <details className="voice-settings"><summary>Voice settings</summary><div><label className="voice-option"><input type="checkbox" checked={voice.autoRead} onChange={e=>voice.toggleAuto(e.target.checked)} disabled={!voice.state.outputSupported}/>Read replies aloud automatically</label><label className="voice-select">Voice<select aria-label="Reading voice" value={voice.voiceURI} onChange={e=>voice.selectVoice(e.target.value)} disabled={!voice.state.outputSupported}><option value="">Automatic English voice</option>{voice.voices.map(v=><option value={v.voiceURI} key={v.voiceURI}>{v.name} ({v.lang})</option>)}</select></label><p className="small-note">Your browser may use its speech service to process audio.</p></div></details>
            {session.messages.length>0&&<div className="step-actions"><button className="text-button" disabled={busy||loading||voice.state.listening} onClick={()=>{voice.cancel();setRestart(true);}}>Restart walkthrough</button><div className="button-row">{session.step+1<selected.sections.length&&<button className="secondary" disabled={busy||loading||voice.state.listening||!!input.trim()} onClick={()=>void finishSession()}>Finish session</button>}<button className="primary" disabled={busy||loading||voice.state.listening||!!input.trim()} title={input.trim()?"Send or clear your message before continuing":undefined} onClick={()=>{if(session.step+1<selected.sections.length)safelySend("Take me through the next section. Explain the actions I need to take and ask one application question.",session.step+1);else void finishSession();}}>{session.step+1<selected.sections.length?"Next step":"Finish session"}</button></div></div>}

          </div>}
        </div>
        {session?.finishedAt&&workspaceTab==="coach"&&results&&<SessionResults results={results} busy={busy} onRestart={()=>{voice.cancel();setRestart(true);}}/>}
        <div className="guidance-reader" hidden={workspaceTab!=="source"}>
          {selected&&sourceSection&&<><div className="reader-controls"><label htmlFor="source-section">Choose a section</label><select ref={sourceSelectRef} id="source-section" value={source} onChange={e=>{voice.cancel();setSource(Number(e.target.value));setQuote("");}}>{selected.sections.map((s,i)=><option key={s.id} value={i}>{i+1}. {s.title}</option>)}</select><div><button className="text-button" disabled={!voice.state.outputSupported||busy||loading} onClick={()=>voice.read(`${sourceSection.title}. ${sourceSection.text}`)}><Volume2 size={16}/>Read section</button>{voice.state.speaking&&<button className="text-button" onClick={voice.stop}><Square size={14}/>Stop reading</button>}<a href={`/api/guidance/${selected.id}/original`}><Download size={16}/>Download original</a></div></div><article className="reader-text"><h3>{sourceSection.title}</h3><SourceText section={sourceSection} quote={quote}/></article><button className="primary" onClick={()=>{voice.cancel();setWorkspaceTab("coach");}}>Back to coach</button></>}
        </div>
      </section>
      <aside className="session-context" aria-label="Guidance and transcript"><details className="context-card about-guide" open><summary><BookOpen size={17}/>About this guide</summary><div>{selected?<><h3>{selected.title}</h3><p>{selected.description||"Work through this guidance with your coach, one practical step at a time."}</p><div className="guide-facts"><span>{selected.sections.length} steps</span><span>{session?levels[session.level].label:"Choose a level"}</span></div>{selected.sample&&<p className="small-note">Fictional practice guidance</p>}<button className="secondary small" disabled={loading||busy} onClick={()=>{voice.cancel();setSource(session?.step||0);setQuote("");setWorkspaceTab("source");}}>Open guidance<ChevronRight size={15}/></button></>:<p>Your published guidance will appear here.</p>}</div></details>
      <details className="context-card conversation-history"><summary><MessageCircle size={17}/>Transcript{session?.messages.length?` (${session.messages.length})`:""}</summary><div className="transcript-scroll">{selected&&session?.messages.length?session.messages.map((m,i)=><CoachMessage key={`${m.at}-${i}`} message={m} onSource={showCitation} sections={selected.sections}/>):<p className="small-note">Your conversation will appear here once you begin.</p>}</div></details><div className="context-note"><Sparkles size={18}/><p>Ask for a simpler explanation or an example whenever you need one.</p></div></aside>
      {selected&&session?.finishedAt&&<LearningProgress progress={progress} busy={busy||loading||voice.state.listening||!!input.trim()} onPractise={()=>{voice.cancel();setRestart(true);}}/>}
      {selected&&<p className="source-reminder">Check the source guidance before using an answer in your work.</p>}
    </div>}
    </main>
    <footer className="site-footer"><span><BookOpen size={14}/>Guidance Coach</span><span>Answers grounded in your uploaded guidance</span></footer>
    <dialog ref={dialogRef} className="editor-dialog" onCancel={e=>{if(busy||extracting)e.preventDefault();else setEditor(false);}}><div className="dialog-heading"><div><p className="eyebrow">ADMIN</p><h2>{editing?"Review guidance":"Add guidance"}</h2></div><button className="icon-button" disabled={busy||extracting} onClick={()=>setEditor(false)} aria-label="Close guidance editor"><X size={22}/></button></div>
      {error&&<div className="alert error" role="alert">{error}</div>}
      {!editing&&<><div className={`upload-zone ${extracting?"extracting":""}`} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();const f=e.dataTransfer.files[0];if(f&&!busy)void loadFile(f);}}><Upload size={26}/><strong>{extracting?"Reading your document…":file?file.name:"Upload a guidance document"}</strong><p>PDF, Word (.docx), TXT or Markdown · Up to 10 MB</p><button className="secondary" onClick={()=>fileInput.current?.click()} disabled={busy||extracting}>{extracting?<LoaderCircle size={16} className="spin"/>:<FileText size={16}/>}Choose a file</button><input ref={fileInput} type="file" accept=".pdf,.docx,.txt,.md" className="sr-only" onChange={e=>{const f=e.target.files?.[0];if(f)void loadFile(f);}}/><span className="small-note">You can also paste guidance into the text box below.</span></div></>}
      <label className="field-label" htmlFor="guide-title">Guidance title</label><input id="guide-title" value={title} maxLength={120} onChange={e=>setTitle(e.target.value)} placeholder="For example: Handling a change of address" disabled={busy}/><label className="field-label" htmlFor="guide-description">Short description <span>(optional)</span></label><input id="guide-description" value={description} maxLength={600} onChange={e=>setDescription(e.target.value)} placeholder="What will this guide help the learner do?" disabled={busy}/>
      <div className="text-review-heading"><label className="field-label" htmlFor="guidance-text">Check the guidance text</label><span>{previewSections.length} sections</span></div><p className="small-note">The coach uses this text. Check that the document was read correctly before publishing. Use # or ## before a heading to create a section.</p><textarea id="guidance-text" value={text} maxLength={240000} rows={12} onChange={e=>setText(e.target.value)} placeholder="Upload a file or paste your guidance here…" disabled={busy||extracting}/>
      <div className="editor-footer"><p>{editing?.status==="published"?"Changes to published text start a fresh walkthrough and score record. Previous scores stay stored for the old version.":"Saved as a draft. Publish from the library when you're ready."}</p><button className="primary" onClick={()=>void save()} disabled={busy||extracting||!title.trim()||text.trim().length<40}>{busy?<LoaderCircle size={17} className="spin"/>:<Check size={17}/>}Save {editing?"changes":"draft"}</button></div>
    </dialog>
    <dialog ref={confirmRef} className="confirm-dialog" onCancel={()=>{setDeleteTarget(null);setRestart(false);}}><h2>{deleteTarget?"Delete this guidance?":"Restart this walkthrough?"}</h2><p>{deleteTarget?`“${deleteTarget.title}” and its saved walkthroughs and scores will be removed.`:"Your conversation for this level will be cleared. Your saved scores and completed steps will be kept."}</p><div className="button-row"><button className="secondary" disabled={busy} onClick={()=>{setDeleteTarget(null);setRestart(false);}}>Cancel</button><button className={deleteTarget?"danger-button":"primary"} disabled={busy} onClick={()=>void confirmAction()}>{busy?"Working…":deleteTarget?"Delete guidance":"Restart walkthrough"}</button></div></dialog>
  </div>;
}
