export type SpeechResult = ArrayLike<{ transcript: string }> & { isFinal: boolean };
export type Recognition = {
  lang: string; continuous: boolean; interimResults: boolean;
  start(): void; stop(): void; abort(): void;
  onresult: ((event: { results: ArrayLike<SpeechResult> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};
export type SpeechConstructor = new () => Recognition;
export type VoiceWindow = Window & { SpeechRecognition?: SpeechConstructor; webkitSpeechRecognition?: SpeechConstructor };

// Browser results contain the complete session, including previously final words.
// Rebuild from the captured base each time so results cannot duplicate typed text.
export function dictate(Speech: SpeechConstructor, options: {
  language: string; base: string;
  onText(text: string): void; onInterim(text: string): void;
  onError(code: string): void; onEnd(): void;
}) {
  const session = new Speech();
  let active = true;
  session.lang = options.language;
  session.continuous = true;
  session.interimResults = true;
  const end = () => {
    if (!active) return;
    active = false;
    options.onInterim('');
    options.onEnd();
  };
  session.onresult = event => {
    if (!active) return;
    const results = Array.from(event.results);
    const final = results.filter(row => row.isFinal).map(row => row[0]?.transcript.trim()).filter(Boolean).join(' ');
    const interim = results.filter(row => !row.isFinal).map(row => row[0]?.transcript.trim()).filter(Boolean).join(' ');
    options.onText([options.base.trimEnd(), final].filter(Boolean).join(' '));
    options.onInterim(interim);
  };
  session.onerror = event => {
    if (!active) return;
    if (event.error !== 'aborted') options.onError(event.error);
    end();
  };
  session.onend = end;
  try { session.start(); }
  catch { options.onError('start-failed'); end(); }
  return {
    stop() { if (active) { try { session.stop(); } catch { end(); } } },
    cancel() { active = false; session.onresult = null; session.onerror = null; session.onend = null; session.abort(); },
  };
}
