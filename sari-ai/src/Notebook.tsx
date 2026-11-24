import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { api } from './data';
import type { AskReply, Entry, Store } from './data';
import { localError, useLanguage } from './language';
import { Icon } from './ui';
import { ProductPhoto } from './StoreTools';

type Recognition = {
  lang: string; start: () => void; abort: () => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null; onend: (() => void) | null;
};
type VoiceWindow = Window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
type Mode = 'note' | 'receipt' | 'product';

export default function Notebook({ open, store, area = 'stock' }: {
  open: (entry: Entry) => void; store: Store; area?: 'stock' | 'sale' | 'expense' | 'payment';
}) {
  const { language, t } = useLanguage();
  const [note, setNote] = useState('');
  const [question, setQuestion] = useState('');
  const [mode, setMode] = useState<Mode>('note');
  const [message, setMessage] = useState('');
  const [matches, setMatches] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [listening, setListening] = useState(false);
  const recognition = useRef<Recognition | null>(null);
  useEffect(() => () => { recognition.current?.abort(); }, []);
  const voice = window as VoiceWindow;

  function startVoice() {
    const Speech = voice.SpeechRecognition ?? voice.webkitSpeechRecognition;
    if (!Speech) return;
    const session = new Speech();
    recognition.current = session;
    session.lang = language === 'fil' ? 'fil-PH' : 'en-PH';
    session.onresult = event => setNote(Array.from(event.results, row => row[0].transcript).join(' '));
    session.onerror = () => setMessage(t('Voice input is unavailable. You can type the entry below.', 'Hindi gumana ang mikropono. Maaari mong i-type ang tala sa ibaba.'));
    session.onend = () => { recognition.current = null; setListening(false); };
    try { session.start(); setListening(true); }
    catch { session.onerror(); }
  }

  async function readPhoto(file: File, capture: Mode) {
    if (file.size > 12_000_000) {
      setMessage(t('Choose a photo under 12 MB.', 'Pumili ng litratong mas maliit sa 12 MB.'));
      return;
    }
    setPending(true); setMessage(''); setMatches([]); setQuestion('');
    try {
      const [{ createWorker }, { default: workerPath }] = await Promise.all([
        import('tesseract.js'), import('tesseract.js/dist/worker.min.js?url'),
      ]);
      const worker = await createWorker('eng', 1, { workerPath, workerBlobURL: false });
      try {
        const { data } = await worker.recognize(file);
        setMode(capture);
        setNote(data.text.trim().slice(0, 4000));
        if (!data.text.trim()) setMessage(t('No text was readable. Use a clearer photo or enter the item manually.',
          'Walang nabasang teksto. Gumamit ng mas malinaw na litrato o ilagay nang manu-mano.'));
      } finally { await worker.terminate(); }
    } catch (error) { setMessage(localError(t, error)); }
    finally { setPending(false); }
  }

  async function review(event: FormEvent) {
    event.preventDefault();
    if (pending || !note.trim()) return;
    setPending(true); setMessage(''); setMatches([]);
    try {
      const reply = await api<AskReply>('ask', {
        question: note.trim(), agent: 'recording', period: 7, language, context: question,
        ...(mode !== 'note' ? { capture: mode } : {}),
      });
      if (reply.draft) {
        open({ ...reply.draft, original: question || note.trim(), draftSource: reply.source });
        setQuestion(''); setNote(''); setMode('note');
      } else {
        setMessage(reply.text);
        setMatches(reply.matches ?? []);
        if (mode === 'note') {
          setQuestion([question, note.trim(), reply.text].filter(Boolean).join('\n').slice(-3500));
          setNote('');
        }
      }
    } catch (error) { setMessage(localError(t, error)); }
    finally { setPending(false); }
  }
  const examples = {
    stock: 'Dagdag 24 na kape.', sale: 'Nabenta ang 2 Coffee sachets.',
    expense: 'Gastos na ₱50 para sa pamasahe.', payment: 'Bayad ni Customer A na 20 pesos.',
  };
  return <form className="note-entry capture-form" onSubmit={review}>
    <label>{mode === 'receipt' ? t('Read from log', 'Nabasa sa talaan') : mode === 'product'
      ? t('Read from product label', 'Nabasa sa label ng item') :
      question ? t('Add the missing detail', 'Idagdag ang kulang na detalye') : t('Describe an entry to Sari', 'Ilarawan kay Sari ang itatala')}
      <textarea rows={mode === 'note' ? 2 : 5} value={note} onChange={event => setNote(event.target.value)}
        placeholder={examples[area]} maxLength={mode === 'note' ? 500 : 4000} required disabled={pending} /></label>
    <div className="action-group capture-actions">
      {(voice.SpeechRecognition || voice.webkitSpeechRecognition) && <button type="button" className="button subtle" disabled={pending || listening}
        onClick={startVoice}>{listening ? t('Listening…', 'Nakikinig…') : t('Dictate', 'Magsalita')}</button>}
      {area === 'stock' && (['receipt', 'product'] as const).map(kind => <label className="button subtle file-button" key={kind}>
        {kind === 'receipt' ? t('Read log', 'Basahin ang talaan') : t('Find by photo', 'Hanapin sa litrato')}
        <input type="file" accept="image/*" capture="environment" disabled={pending} onChange={event => {
          const file = event.target.files?.[0];
          if (file) void readPhoto(file, kind);
          event.target.value = '';
        }} /></label>)}
      {(question || mode !== 'note') && <button type="button" className="text-link" disabled={pending}
        onClick={() => { setQuestion(''); setNote(''); setMessage(''); setMode('note'); setMatches([]); }}>{t('Start over', 'Magsimula muli')}</button>}
    </div>
    {message && <p role="status">{message}</p>}
    {matches.length > 0 && <div className="capture-matches">{store.products.filter(product => matches.includes(product.id)).map(product =>
      <button key={product.id} type="button" className="button secondary" onClick={() => open({
        kind: 'stock', reason: 'restock', lines: [{ product_id: product.id, quantity: '', note: '' }],
      })}><ProductPhoto product={product} />{product.name}</button>)}</div>}
    <button className="button primary" disabled={pending || !note.trim()}>
      {pending ? t('Reading…', 'Binabasa…') : mode === 'product' ? t('Find item', 'Hanapin ang item') : t('Review draft', 'Suriin ang draft')} <Icon name="arrow" size={16} />
    </button>
  </form>;
}
