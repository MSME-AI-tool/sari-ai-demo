import type { AskReply } from './data';

export async function readAnswerStream(response: Response, onDelta: (text: string) => void): Promise<AskReply> {
  if (!response.ok) {
    const problem = await response.json().catch(() => ({}));
    throw new Error(typeof problem.detail === 'string' ? problem.detail : 'Sari is unavailable. Please try again.');
  }
  if (!response.body) throw new Error('Streaming is unavailable in this browser.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let answer: AskReply | undefined;
  function consume(frame: string) {
    const lines = frame.split(/\r?\n/);
    const kind = lines.find(line => line.startsWith('event:'))?.slice(6).trim();
    const data = lines.filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
    if (!data) return;
    const value = JSON.parse(data);
    if (kind === 'delta' && typeof value.text === 'string') onDelta(value.text);
    else if (kind === 'done' && typeof value.text === 'string' && typeof value.agent === 'string' && typeof value.source === 'string') answer = value;
    else if (kind === 'error') throw new Error(typeof value.detail === 'string' ? value.detail : 'The response was interrupted.');
  }
  try {
    while (!answer) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      if (buffer.length > 262144) throw new Error('The response is too large. Please try a shorter question.');
      let separator: RegExpExecArray | null;
      while ((separator = /\r?\n\r?\n/.exec(buffer))) {
        consume(buffer.slice(0, separator.index));
        buffer = buffer.slice(separator.index + separator[0].length);
        if (answer) break;
      }
      if (done) break;
    }
    if (!answer) throw new Error('The response was interrupted. Please try again.');
    return answer;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export async function askStream(entry: object, onDelta: (text: string) => void, signal: AbortSignal): Promise<AskReply> {
  const response = await fetch('/api/v1/ask/stream', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify(entry), signal,
  });
  return readAnswerStream(response, onDelta);
}
