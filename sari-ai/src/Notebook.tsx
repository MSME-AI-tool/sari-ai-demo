import { useState } from 'react';
import type { FormEvent } from 'react';
import { api } from './data';
import type { AskReply, Entry } from './data';

export default function Notebook({ open }: { open: (entry: Entry) => void }) {
  const [note, setNote] = useState('');
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  async function review(event: FormEvent) {
    event.preventDefault();
    if (pending || !note.trim()) return;
    setPending(true);
    setMessage('');
    try {
      const reply = await api<AskReply>('ask', { question: note.trim(), agent: 'recording', period: 7 });
      if (reply.draft) open({ ...reply.draft, original: note.trim(), draftSource: reply.source });
      else setMessage(reply.text);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not read this entry.');
    } finally {
      setPending(false);
    }
  }
  return <form className="note-entry" onSubmit={review}>
    <label>Notebook entry<input value={note} onChange={event => setNote(event.target.value)}
      placeholder="Dagdag 24 na kape." maxLength={500} required disabled={pending} /></label>
    {message && <p role="status">{message}</p>}
    <button className="text-link" disabled={pending || !note.trim()}>{pending ? 'Reading entry…' : 'Review entry →'}</button>
  </form>;
}
