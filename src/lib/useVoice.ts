import { useCallback, useEffect, useRef, useState } from "react";
import { Controller, type VoiceState } from "./voice.js";

const initial: VoiceState = { inputSupported:false, outputSupported:false, active:false, busy:false, listening:false, stopping:false, speaking:false, spoken:false };

export function useVoice(onDraft: (text: string) => void, active: boolean, busy: boolean) {
  const controller = useRef<Controller|null>(null);
  const draft = useRef(onDraft);
  const context = useRef({ active, busy });
  draft.current = onDraft;
  context.current = { active, busy };
  const auto = useRef(false);
  const [state,setState] = useState(initial);
  const [notice,setNotice] = useState({ text:"", error:false });
  const [autoRead,setAutoRead] = useState(false);
  const [voices,setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceURI,setVoiceURI] = useState("");

  useEffect(() => {
    const c = new Controller({ onState:setState, onDraft:text=>draft.current(text), onNotice:(text,error=false)=>setNotice({text,error}) });
    controller.current = c;
    c.setContext(context.current.active,context.current.busy);
    const fill = () => setVoices(c.voices());
    const hide = () => {
      if(document.hidden) { c.cancelListening(); c.stopSpeaking(); setNotice({text:"Audio stopped while the page is hidden.",error:false}); }
    };
    const leave = () => c.reset();
    fill();
    window.speechSynthesis?.addEventListener("voiceschanged",fill);
    document.addEventListener("visibilitychange",hide);
    window.addEventListener("pagehide",leave);
    return () => {
      window.speechSynthesis?.removeEventListener("voiceschanged",fill);
      document.removeEventListener("visibilitychange",hide);
      window.removeEventListener("pagehide",leave);
      controller.current = null;
      c.reset();
    };
  },[]);
  useEffect(() => { controller.current?.setContext(active,busy); },[active,busy]);

  const cancel = useCallback(() => {
    controller.current?.cancelListening(); controller.current?.stopSpeaking(); setNotice({text:"",error:false});
  },[]);
  const read = useCallback((text:string) => {
    if(document.hidden) return;
    const c=controller.current;
    if(!c) return;
    c.setContext(context.current.active,context.current.busy);
    c.setSpoken(true); c.speak(text);
  },[]);
  const readNewReply = useCallback((text:string) => {
    if(!auto.current || document.hidden) return;
    const c=controller.current;
    if(!c || !context.current.active) return;
    // Called only after a successful coach request, never on history reload.
    c.setContext(true,false); c.setSpoken(true); c.speak(text);
  },[]);
  const toggleAuto = useCallback((enabled:boolean) => {
    auto.current=enabled; setAutoRead(enabled);
    if(!enabled) controller.current?.stopSpeaking();
  },[]);
  const selectVoice = useCallback((uri:string) => { setVoiceURI(uri); controller.current?.selectVoice(uri); },[]);
  const talk = useCallback((text:string) => {
    const c=controller.current; if(!c) return;
    c.setContext(context.current.active,context.current.busy);
    if(c.snapshot().listening) c.stopListening(); else c.startListening(text);
  },[]);
  const stop = useCallback(() => { controller.current?.stopSpeaking(); setNotice({text:"Reading stopped.",error:false}); },[]);
  return { state,notice,autoRead,voices,voiceURI,cancel,read,readNewReply,toggleAuto,selectVoice,talk,stop };
}
