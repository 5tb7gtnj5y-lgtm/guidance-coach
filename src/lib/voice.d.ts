export type VoiceState = {
  inputSupported: boolean; outputSupported: boolean; active: boolean; busy: boolean;
  listening: boolean; stopping: boolean; speaking: boolean; spoken: boolean;
};
export function speechChunks(text: string): string[];
export class Controller {
  constructor(options?: { environment?: unknown; onState?: (state: VoiceState) => void; onDraft?: (text: string) => void; onNotice?: (text: string, error?: boolean) => void });
  snapshot(): VoiceState;
  setContext(active: boolean, busy?: boolean): void;
  startListening(draft?: string): boolean;
  stopListening(): void;
  cancelListening(): void;
  setSpoken(enabled: boolean): void;
  voices(): SpeechSynthesisVoice[];
  selectVoice(uri: string): void;
  stopSpeaking(): void;
  speak(text: string): boolean;
  reset(): void;
}
