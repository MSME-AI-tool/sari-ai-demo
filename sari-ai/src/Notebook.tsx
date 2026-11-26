import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { api } from './data';
import type { AskReply, Entry, Store } from './data';
import { localError, useLanguage } from './language';
import { Icon } from './ui';
import { ProductPhoto } from './StoreTools';

import { dictate } from './dictation';
import type { VoiceWindow } from './dictation';
type Mode = 'note' | 'record' | 'product';
type RecordType = 'auto' | 'sale' | 'restock' | 'count' | 'waste';

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
  const [stopping, setStopping] = useState(false);
  const [interim, setInterim] = useState('');
  const [recordType, setRecordType] = useState<RecordType>('auto');
  const [photo, setPhoto] = useState('');
  const [reading, setReading] = useState<{ progress: number; retry: boolean } | null>(null);
  const recognition = useRef<ReturnType<typeof dictate> | null>(null);
  const photoJob = useRef<AbortController | null>(null);
  const stopTimer = useRef<number | undefined>(undefined);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false; recognition.current?.cancel(); photoJob.current?.abort();
      window.clearTimeout(stopTimer.current);
    };
  }, []);
  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo); }, [photo]);
  const voice = window as VoiceWindow;
  const Speech = voice.SpeechRecognition ?? voice.webkitSpeechRecognition;
  const stockOrSale = area === 'stock' || area === 'sale';

  function startVoice() {
    if (!Speech || listening || pending) return;
    setMessage(''); setInterim(''); setListening(true); setStopping(false);
    recognition.current = dictate(Speech, {
      base: note, language: language === 'fil' ? 'fil-PH' : 'en-PH',
      onText: setNote, onInterim: setInterim,
      onEnd: () => {
        recognition.current = null; setListening(false); setStopping(false);
        window.clearTimeout(stopTimer.current);
      },
      onError: code => {
        const messages: Record<string, string> = {
          'not-allowed': t('Allow microphone access in your browser, then try again. You can also type your entry.', 'Payagan ang mikropono sa browser, saka subukan muli. Maaari ring mag-type.'),
          'service-not-allowed': t('Voice recognition is blocked by this browser. You can type your entry.', 'Hindi pinapayagan ng browser ang pagkilala sa boses. Maaari kang mag-type.'),
          'audio-capture': t('No microphone was found. Connect a microphone or type your entry.', 'Walang makitang mikropono. Ikonekta ito o mag-type ng tala.'),
          'no-speech': t('No speech was heard. Try again closer to the microphone.', 'Walang narinig na salita. Lumapit sa mikropono at subukan muli.'),
          network: t('Voice recognition could not connect. Check your connection or type your entry.', 'Hindi makakonekta ang pagkilala sa boses. Suriin ang internet o mag-type.'),
          'language-not-supported': t('Voice recognition does not support this language here. Try the other language or type your entry.', 'Hindi suportado rito ang wikang ito para sa boses. Subukan ang ibang wika o mag-type.'),
        };
        setMessage(messages[code] ?? t('Voice input stopped. Your completed words are kept. You can continue typing.', 'Huminto ang mikropono. Napanatili ang mga kumpletong salita. Maaari kang magpatuloy sa pag-type.'));
      },
    });
  }

  function stopVoice() {
    setStopping(true);
    stopTimer.current = window.setTimeout(() => {
      recognition.current?.cancel(); recognition.current = null;
      setListening(false); setStopping(false); setInterim('');
      setMessage(t('Voice input ended. Check the text for any missing words.', 'Natapos ang pagdidikta. Suriin kung may kulang na salita.'));
    }, 6000);
    recognition.current?.stop();
  }

  function cancelPhoto() {
    photoJob.current?.abort(); photoJob.current = null; setReading(null); setPending(false);
    setMessage(t('Photo reading cancelled. Your entry is kept.', 'Kinansela ang pagbasa. Napanatili ang iyong tala.'));
  }

  async function readPhoto(file: File, capture: 'record' | 'product') {
    if (pending || listening) return;
    if (file.size > 12_000_000 || !file.type.startsWith('image/')) {
      setMessage(t('Choose an image under 12 MB.', 'Pumili ng litratong mas maliit sa 12 MB.')); return;
    }
    const controller = new AbortController(); photoJob.current = controller;
    setPhoto(URL.createObjectURL(file));
    setPending(true); setReading({ progress: 0, retry: false }); setMessage(''); setMatches([]); setQuestion('');
    try {
      const { readImage } = await import('./ocr');
      if (controller.signal.aborted) return;
      const result = await readImage(file, { signal: controller.signal, product: capture === 'product',
        onProgress: (progress, retry) => setReading({ progress, retry }),
      });
      if (controller.signal.aborted || !mounted.current) return;
      if (!result.text) {
        setMessage(t('No text was readable. Retake the photo in good light, crop to the writing, or type your entry.',
          'Walang mabasang teksto. Ulitin sa maliwanag na lugar, i-crop sa sulat, o mag-type.')); return;
      }
      setMode(capture);
      setNote(previous => [previous.trimEnd(), result.text].filter(Boolean).join('\n'));
      setMessage(result.confidence < 75
        ? t('Some words may be unclear. Compare the text with your photo and correct every item and quantity before reviewing.', 'Maaaring malabo ang ilang salita. Ihambing sa litrato at itama ang bawat item at bilang bago suriin.')
        : t('Text added. Check the item names, quantities, and entry type before reviewing.', 'Naidagdag ang teksto. Suriin ang mga item, bilang, at uri ng tala.'));
    } catch {
      if (!controller.signal.aborted && mounted.current) setMessage(t('The photo could not be read. Try a JPG or PNG in good light. Check your connection for the first scan, or type the entry.',
        'Hindi mabasa ang litrato. Subukan ang malinaw na JPG o PNG. Kailangan ng internet sa unang pagbasa, o mag-type ng tala.'));
    } finally {
      if (photoJob.current === controller && mounted.current) {
        photoJob.current = null; setPending(false); setReading(null);
      }
    }
  }

  function reset() {
    setQuestion(''); setNote(''); setMessage(''); setMode('note'); setMatches([]); setPhoto(''); setRecordType('auto');
  }

  async function review(event: FormEvent) {
    event.preventDefault();
    if (pending || listening || !note.trim() || note.length > 4000) return;
    setPending(true); setMessage(''); setMatches([]);
    try {
      const reply = await api<AskReply>('ask', {
        question: note.trim(), agent: 'recording', period: 7, language, context: question,
        ...(mode === 'product' ? { capture: 'product' } : stockOrSale ? {
          record_type: recordType, ...(mode === 'record' ? { capture: 'record' } : {}),
        } : {}),
      });
      if (!mounted.current) return;
      if (reply.draft) {
        open({ ...reply.draft, original: question || note.trim(), draftSource: reply.source });
        reset();
      } else {
        setMessage(reply.text);
        setMatches(reply.matches ?? []);
        if (mode === 'note' && recordType === 'auto') {
          setQuestion([question, note.trim(), reply.text].filter(Boolean).join('\n').slice(-3500));
          setNote('');
        }
      }
    } catch (error) { if (mounted.current) setMessage(localError(t, error)); }
    finally { if (mounted.current) setPending(false); }
  }
  const examples = {
    stock: 'Dagdag 24 na kape.', sale: 'Nabenta ang 2 Coffee sachets.',
    expense: 'Gastos na ₱50 para sa pamasahe.', payment: 'Bayad ni Customer A na 20 pesos.',
  };
  return <form className="note-entry capture-form" onSubmit={review} aria-busy={pending}>
    {photo && <figure className="capture-preview"><a className="capture-photo" href={photo} target="_blank" rel="noreferrer">
      <img src={photo} alt={t('Your uploaded photo for comparison', 'Iyong litrato para maihambing')} />
      <span>{t('Enlarge photo', 'Palakihin ang litrato')}</span></a><figcaption>
      {t('Compare with your photo. Handwriting may need corrections.', 'Ihambing sa litrato. Maaaring kailangang itama ang sulat-kamay.')}</figcaption></figure>}
    <label>{mode === 'record' ? t('Check the text from your photo', 'Suriin ang teksto mula sa litrato') : mode === 'product'
      ? t('Read from product label', 'Nabasa sa label ng item') :
      question ? t('Add the missing detail', 'Idagdag ang kulang na detalye') : t('Describe an entry to Sari', 'Ilarawan kay Sari ang itatala')}
      <textarea rows={mode === 'note' ? 2 : 5} value={note} onChange={event => setNote(event.target.value)}
        placeholder={examples[area]} maxLength={4000} required disabled={pending || listening} /></label>
    {note.length > 3500 && <p role="status">{note.length}/4000 {note.length > 4000 && t('— shorten the text before reviewing.', '— paikliin ang teksto bago suriin.')}</p>}
    {stockOrSale && mode !== 'product' && <label className="capture-type">{t('Entry type', 'Uri ng tala')}
      <select value={recordType} disabled={pending || listening} onChange={event => { setRecordType(event.target.value as RecordType); setQuestion(''); setMatches([]); }}>
        <option value="auto">{t('Let Sari read the entry type', 'Ipabasa kay Sari ang uri')}</option>
        <option value="sale">{t('Sale · items sold', 'Benta · mga nabenta')}</option>
        <option value="restock">{t('Stock-in · items received', 'Dagdag · mga dumating')}</option>
        <option value="count">{t('Physical count · items left', 'Aktuwal na bilang · mga natitira')}</option>
        <option value="waste">{t('Wastage · damaged or expired', 'Sira · nasira o nag-expire')}</option>
      </select></label>}
    <div className="action-group capture-actions">
      {Speech && <button type="button" className="button subtle" disabled={pending || stopping}
        onClick={listening ? stopVoice : startVoice}><Icon name="microphone" size={17} />{stopping ? t('Finishing…', 'Tinatapos…') : listening ? t('Stop dictation', 'Tapusin ang pagdidikta') : t('Speak entry', 'Magsalita')}</button>}
      {(['record', ...(area === 'stock' ? ['product'] as const : [])] as const).map(kind => <label className="button subtle file-button" key={kind} aria-disabled={pending || listening}>
        <Icon name={kind === 'record' ? 'clipboard' : 'camera'} size={17} />
        {kind === 'record' ? t('Read photo', 'Basahin ang litrato') : t('Find by photo', 'Hanapin sa litrato')}
        <input type="file" accept="image/*" disabled={pending || listening} onChange={event => {
          const file = event.target.files?.[0];
          if (file) void readPhoto(file, kind);
          event.target.value = '';
        }} /></label>)}
      {(note || question || photo) && <button type="button" className="text-link" disabled={pending || listening} onClick={reset}>{t('Start over', 'Magsimula muli')}</button>}
    </div>
    {listening && <p className="capture-listening" role="status">{interim || t('Listening… Say the entry, then choose Stop dictation.', 'Nakikinig… Sabihin ang tala, saka tapusin ang pagdidikta.')}</p>}
    {!Speech && <p className="muted">{t('Voice input is unavailable in this browser. You can type or read a photo.', 'Walang pagdidikta sa browser na ito. Maaari kang mag-type o gumamit ng litrato.')}</p>}
    {reading && <div className="capture-progress"><label>{reading.retry ? t('Improving contrast and reading again…', 'Inaayos ang linaw at binabasa muli…') : reading.progress ? t('Reading your photo…', 'Binabasa ang litrato…') : t('Preparing photo reader…', 'Inihahanda ang pambasa…')}
      <progress max={1} value={reading.progress} /></label><button type="button" className="button secondary" onClick={cancelPhoto}>{t('Cancel reading', 'Kanselahin ang pagbasa')}</button></div>}
    {message && <p role="status">{message}</p>}
    {matches.length > 0 && <div className="capture-matches">{store.products.filter(product => matches.includes(product.id)).map(product =>
      <button key={product.id} type="button" className="button secondary" onClick={() => open({
        kind: 'stock', reason: 'restock', lines: [{ product_id: product.id, quantity: '', note: '' }],
      })}><ProductPhoto product={product} />{product.name}</button>)}</div>}
    <p className="muted capture-help">{t('Nothing is saved until you review the draft and confirm.', 'Suriin at kumpirmahin muna ang draft bago ito ma-save.')}</p>
    <button className="button primary" disabled={pending || listening || !note.trim() || note.length > 4000}>
      {pending ? t('Reading…', 'Binabasa…') : mode === 'product' ? t('Find item', 'Hanapin ang item') : t('Review draft', 'Suriin ang draft')} <Icon name="arrow" size={16} />
    </button>
  </form>;
}
