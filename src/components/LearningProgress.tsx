import { useState, useEffect, useRef } from 'react';
import { levels, passScore, criterionNames, type Progress, type LearnerReport } from '@/lib/progress';
export function LearningProgress({progress,busy,onPractise}:{progress:Progress|null;busy:boolean;onPractise:(step:number)=>void}){
  return <details className="learning-progress"><summary>My progress{progress?` · ${progress.completed} of ${progress.totalSections} steps passed`:''}</summary>
    {!progress?<p>Progress will appear when your guide opens.</p>:<>
      <p>{levels[progress.level].label} · {progress.percent}% complete · Average best score: {progress.averageScore===null?'Not scored yet':`${progress.averageScore}%`}</p>
      <progress aria-label="Steps passed" value={progress.completed} max={progress.totalSections}/>
      <p className="small-note">Pass a step with {passScore}% or more. Moving to the next step does not award marks. Your best score is kept.</p>
      <div className="progress-table"><table><thead><tr><th scope="col">Step</th><th scope="col">Best score</th><th scope="col">Status</th><th scope="col">Practice</th></tr></thead><tbody>{progress.sections.map((section,index)=><tr key={section.id}><th scope="row">{index+1}. {section.title}</th><td>{section.bestScore===null?'—':`${section.bestScore}%`}</td><td>{section.completed?'Passed':section.attempts?'Practise again':'Not scored'}</td><td><button className="text-button" disabled={busy} onClick={()=>onPractise(index)}>Practise</button></td></tr>)}</tbody></table></div>
      {progress.history.length>0&&<details className="attempt-history"><summary>Recent scores ({progress.attempts} attempts in total)</summary><ol>{progress.history.map(attempt=><li key={attempt.id}><span>{attempt.sectionTitle} · {attempt.score}%</span><time dateTime={new Date(attempt.at).toISOString()}>{new Date(attempt.at).toLocaleString('en-GB')}</time></li>)}</ol></details>}
      <p className="small-note">Progress is saved for this guide version and level in this browser. AI practice scores support learning; they are not a qualification.</p>
    </>}
  </details>;
}
export function LearnerProgressReport(){
  const [reports,setReports]=useState<LearnerReport[]|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const refresh=async()=>{setBusy(true);setError('');try{const result=await fetch('/api/progress?admin=1'),data=await result.json() as {reports:LearnerReport[];error?:string};if(!result.ok)throw new Error(data.error||'Progress could not be loaded.');setReports(data.reports);}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
  return <details className="learner-report" onToggle={e=>{if(e.currentTarget.open&&reports===null&&!busy)void refresh();}}><summary>Learner progress</summary>
    <p className="small-note">Learner references identify browsers, not names. Scores cover the current guide version. Admin practice is excluded.</p>
    <button className="secondary small" disabled={busy} onClick={()=>void refresh()}>{busy?'Loading…':'Refresh report'}</button>
    {error&&<p role="alert">{error}</p>}{reports&&!reports.length&&<p>No learner answers have been scored yet.</p>}
    {!!reports?.length&&<div className="progress-table"><table><thead><tr>{['Learner','Guide','Level','Steps passed','Average best score','Attempts','Last practice'].map(label=><th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{reports.map(report=><tr key={`${report.learner}:${report.documentId}:${report.level}`}><th scope="row">{report.learner}</th><td>{report.title}</td><td>{levels[report.level].label}</td><td>{report.completed}/{report.totalSections}</td><td>{report.averageScore===null?'—':`${report.averageScore}%`}</td><td>{report.attempts}</td><td>{new Date(report.lastAt).toLocaleString('en-GB')}</td></tr>)}</tbody></table></div>}
  </details>;
}

export function SessionResults({results,busy,onRestart}:{results:Progress;busy:boolean;onRestart:()=>void}){
  const heading=useRef<HTMLHeadingElement>(null);
  useEffect(()=>{heading.current?.focus();},[]);
  return <section className="session-results" aria-label="Session results"><h2 ref={heading} tabIndex={-1}>Session results</h2>
    <p className="result-score">{results.averageScore===null?"No answers assessed":`${results.averageScore}% session score`}</p>
    <p>{levels[results.level].label} · {results.sections.filter(s=>s.attempts>0).length} of {results.totalSections} steps assessed · {results.completed} steps passed</p>
    <p className="small-note">Your score is the average of your best answers for the steps assessed in this session. Unassessed steps are shown below. A step passes at {passScore}%.</p>
    <div className="progress-table"><table><thead><tr><th scope="col">Step</th><th scope="col">Best score</th><th scope="col">Result</th></tr></thead><tbody>{results.sections.map((section,index)=><tr key={section.id}><th scope="row">{index+1}. {section.title}</th><td>{section.bestScore===null?'—':`${section.bestScore}%`}</td><td>{section.completed?'Passed':section.attempts?'Needs more practice':'Not assessed'}</td></tr>)}</tbody></table></div>
    {!!results.history.length&&<details className="result-details"><summary>Recent answer feedback and scoring</summary>{results.history.map(attempt=><article key={attempt.id}><h3>{attempt.sectionTitle} · {attempt.score}%</h3><p>{attempt.assessment.feedback}</p><ul>{(Object.keys(criterionNames) as (keyof typeof criterionNames)[]).map(name=><li key={name}><strong>{criterionNames[name]}: {attempt.assessment.criteria[name].score}/4</strong> — {attempt.assessment.criteria[name].feedback}</li>)}</ul></article>)}</details>}
    <p className="small-note">AI practice feedback supports learning; it is not a qualification. Your results are saved in this browser.</p>
    <button className="primary" disabled={busy} onClick={onRestart}>Start new session</button>
  </section>;
}
