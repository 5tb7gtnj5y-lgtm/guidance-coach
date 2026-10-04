import test from "node:test";
import assert from "node:assert/strict";
import { Controller, speechChunks } from "../src/lib/voice.js";
function fixture({ input = true, output = true, secure = true, prefixed = false } = {}) {
  const captures = [], spoken = [], timers = new Map(), drafts = [], notices = [], states = [];
  let nextTimer = 0, cancelCount = 0;
  class Recognition {
    constructor() { captures.push(this); this.starts = this.stops = this.aborts = 0; }
    start() { this.starts++; }
    stop() { this.stops++; }
    abort() { this.aborts++; }
    result(...words) {
      this.onresult({ results: words.map(text => [{ transcript: text }]) });
    }
    error(error) { this.onerror({ error }); }
    end() { this.onend(); }
  }
  class Utterance { constructor(text) { this.text = text; } }
  const voices = [{ voiceURI: "british", lang: "en-GB", name: "UK voice" },
    { voiceURI: "american", lang: "en-US", name: "US voice" }];
  const host = {
    isSecureContext: secure,
    setTimeout(fn, ms) { const id = ++nextTimer; timers.set(id, { fn, ms }); return id; },
    clearTimeout(id) { timers.delete(id); },
    ...(input ? { [prefixed ? "webkitSpeechRecognition" : "SpeechRecognition"]: Recognition } : {}),
    ...(output ? {
      SpeechSynthesisUtterance: Utterance,
      speechSynthesis: {
        getVoices: () => voices,
        cancel() { cancelCount++; },
        speak(utterance) { spoken.push(utterance); },
        addEventListener() {},
      },
    } : {}),
  };
  const controller = new Controller({
    environment: host,
    onDraft: text => drafts.push(text),
    onNotice: (text, error) => notices.push({ text, error }),
    onState: state => states.push(state),
  });
  controller.setContext(true);
  return {
    host, controller, captures, spoken, drafts, notices, states, timers, voices,
    cancelCount: () => cancelCount,
    runTimer(ms) {
      const match = [...timers].find(([, timer]) => timer.ms === ms);
      assert.ok(match, "timer exists: " + ms);
      timers.delete(match[0]);
      match[1].fn();
    },
  };
}
test("voice is opt-in: construction never opens the microphone or speaks", () => {
  const f = fixture();
  assert.equal(f.captures.length, 0);
  assert.equal(f.spoken.length, 0);
  assert.equal(f.controller.snapshot().spoken, false);
});
test("a page microphone policy block is distinguished from a browser permission denial", () => {
  for (const property of ["permissionsPolicy", "featurePolicy"]) {
    const f = fixture();
    f.host.document = { [property]: { allowsFeature: name => { assert.equal(name, "microphone"); return false; } } };
    assert.equal(f.controller.startListening("Keep this draft."), false);
    assert.equal(f.captures.length, 0);
    assert.equal(f.drafts.length, 0);
    assert.match(f.notices.at(-1).text, /This page is blocking microphone access/);
    f.host.document[property].allowsFeature = () => true;
    assert.equal(f.controller.startListening("Keep this draft."), true);
    assert.equal(f.captures[0].starts, 1);
    f.controller.reset();
  }
});
test("standard and Safari-prefixed speech recognition transcribe one reviewed turn", () => {
  for (const prefixed of [false, true]) {
    const f = fixture({ prefixed });
    assert.equal(f.controller.startListening("Hello."), true);
    const r = f.captures[0];
    assert.equal(r.starts, 1);
    assert.equal(r.lang, "en-GB");
    assert.equal(r.continuous, false);
    r.result("I understand");
    r.result("I understand", "your concern.");
    assert.equal(f.drafts.at(-1), "Hello. I understand your concern.");
    r.end();
    assert.equal(f.controller.snapshot().listening, false);
    assert.match(f.notices.at(-1).text, /Check the words/);
    assert.equal(f.spoken.length, 0);
  }
});
test("stop waits for the final words and never submits a reply", () => {
  const f = fixture();
  f.controller.startListening();
  const r = f.captures[0];
  r.result("Could you");
  f.controller.stopListening();
  assert.equal(r.stops, 1);
  assert.equal(f.controller.snapshot().stopping, true);
  r.result("Could you explain the letter?");
  r.end();
  assert.equal(f.drafts.at(-1), "Could you explain the letter?");
  assert.equal(f.timers.size, 0);
});
test("a stuck stop releases the mic and retains the visible transcription", () => {
  const f = fixture();
  f.controller.startListening();
  const r = f.captures[0];
  r.result("Please tell me more.");
  f.controller.stopListening();
  f.runTimer(2500);
  assert.equal(r.aborts, 1);
  assert.equal(f.controller.snapshot().listening, false);
  r.result("late words");
  assert.equal(f.drafts.at(-1), "Please tell me more.");
});
test("microphone capture has a sixty-second limit without auto-restart", () => {
  const f = fixture();
  f.controller.startListening();
  f.runTimer(60000);
  assert.equal(f.captures[0].stops, 1);
  f.captures[0].end();
  assert.equal(f.captures.length, 1);
});
test("permission, network, no-speech and missing-mic errors preserve the draft and allow retry", () => {
  for (const error of ["not-allowed", "service-not-allowed", "network", "no-speech", "audio-capture", "language-not-supported"]) {
    const f = fixture();
    f.controller.startListening("Typed reply");
    f.captures[0].error(error);
    assert.equal(f.controller.snapshot().listening, false);
    assert.equal(f.notices.at(-1).error, true);
    assert.equal(f.drafts.length, 0);
    assert.equal(f.controller.startListening("Typed reply"), true);
  }
});
test("unsupported or insecure input does not prevent spoken output or typing", () => {
  for (const options of [{ input: false }, { secure: false }]) {
    const f = fixture(options);
    assert.equal(f.controller.startListening("typed"), false);
    assert.equal(f.drafts.length, 0);
    assert.match(f.notices.at(-1).text, /Type your reply/);
    f.controller.setSpoken(true);
    assert.equal(f.controller.speak("Hello."), true);
  }
});
test("unsupported speech output leaves dictation available", () => {
  const f = fixture({ output: false });
  f.controller.setSpoken(true);
  assert.equal(f.controller.snapshot().spoken, false);
  assert.equal(f.controller.speak("Hello."), false);
  assert.equal(f.controller.startListening(), true);
});
test("dictation cannot exceed the existing eighteen-hundred-character reply limit", () => {
  const f = fixture();
  assert.equal(f.controller.startListening("x".repeat(1800)), false);
  f.controller.startListening("Existing reply");
  f.captures[0].result("x".repeat(2000));
  assert.equal(f.drafts.at(-1).length, 1800);
  assert.equal(f.captures[0].stops, 1);
});
test("sending, assessment, reset and leaving the page invalidate late recognition callbacks", () => {
  for (const finish of [c => c.setContext(true, true), c => c.setContext(false), c => c.reset(), c => c.cancelListening()]) {
    const f = fixture();
    f.controller.startListening();
    const r = f.captures[0];
    r.result("Existing words");
    finish(f.controller);
    r.result("Words from the old attempt");
    r.end();
    assert.equal(f.drafts.at(-1), "Existing words");
    assert.equal(f.controller.snapshot().listening, false);
    assert.equal(f.timers.size, 0);
  }
});
test("muting stops playback and ignores callbacks from cancelled speech", () => {
  const f = fixture();
  f.controller.setSpoken(true);
  f.controller.speak("Long reply. ".repeat(60));
  assert.equal(f.spoken.length, 1);
  f.controller.setSpoken(false);
  f.spoken[0].onend();
  assert.equal(f.spoken.length, 1);
  assert.equal(f.controller.snapshot().speaking, false);
  assert.equal(f.controller.speak("More"), false);
});
test("speech chunks retain the exact words and play sequentially with a British default voice", () => {
  const f = fixture();
  const text = "I understand your concern and want to help. ".repeat(15).trim();
  const chunks = speechChunks(text);
  assert.equal(chunks.join(" "), text);
  f.controller.setSpoken(true);
  f.controller.speak(text);
  for (let i = 0; i < chunks.length; i++) {
    assert.equal(f.spoken[i].text, chunks[i]);
    assert.equal(f.spoken[i].voice.voiceURI, "british");
    f.spoken[i].onend();
  }
  assert.equal(f.controller.snapshot().speaking, false);
  assert.equal(f.timers.size, 0);
});
test("voice selection, replay and interruptions cancel old audio before microphone input", () => {
  const f = fixture();
  f.controller.setSpoken(true);
  f.controller.selectVoice("american");
  f.controller.speak("First reply.");
  assert.equal(f.spoken[0].voice.voiceURI, "american");
  f.controller.speak("Replay.");
  f.spoken[0].onend();
  assert.equal(f.spoken.length, 2);
  f.controller.startListening();
  assert.equal(f.controller.snapshot().speaking, false);
  assert.equal(f.controller.snapshot().listening, true);
  const r = f.captures[0];
  f.controller.speak("A customer reply.");
  assert.equal(r.aborts, 1);
  r.result("Customer's own voice must not become an advisor reply");
  assert.equal(f.drafts.length, 0);
});
test("autoplay errors and stuck speech show a replay fallback without affecting text", () => {
  const f = fixture();
  f.controller.setSpoken(true);
  f.controller.speak("Customer reply");
  f.spoken[0].onerror({ error: "not-allowed" });
  assert.match(f.notices.at(-1).text, /tap to play audio/);
  f.controller.speak("Customer reply");
  f.runTimer(30000);
  assert.equal(f.controller.snapshot().speaking, false);
  assert.match(f.notices.at(-1).text, /replay/);
});
