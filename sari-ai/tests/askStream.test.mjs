import test from 'node:test';
import assert from 'node:assert/strict';
import { readAnswerStream } from '../src/askStream.ts';

const encode = new TextEncoder();
const answer = { agent: 'insights', source: 'external', text: 'Benta ₱10.', destination: 'sales' };
const event = (kind, data) => `event: ${kind}\ndata: ${JSON.stringify(data)}\n\n`;

test('text arrives before the final answer, including split UTF-8 characters', async () => {
  let stream;
  const body = new ReadableStream({ start(controller) { stream = controller; } });
  const deltas = [];
  const pending = readAnswerStream(new Response(body), text => deltas.push(text));
  const bytes = encode.encode(event('delta', { text: 'Benta ₱10.' }));
  for (const byte of bytes) stream.enqueue(new Uint8Array([byte]));
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(deltas, ['Benta ₱10.']);
  stream.enqueue(encode.encode(event('done', answer)));
  stream.close();
  assert.deepEqual(await pending, answer);
});

test('a safe final fallback replaces a partial provider response', async () => {
  const fallback = { ...answer, text: 'Recorded sales: ₱10.', source: 'records', reason: 'unavailable' };
  const response = new Response(event('delta', { text: 'Partial' }) + event('done', fallback));
  assert.deepEqual(await readAnswerStream(response, () => {}), fallback);
});

test('an interrupted stream is not treated as a complete answer', async () => {
  await assert.rejects(readAnswerStream(new Response(event('delta', { text: 'Partial' })), () => {}), /interrupted/i);
});

test('server and HTTP errors are surfaced', async () => {
  await assert.rejects(readAnswerStream(new Response(event('error', { detail: 'Try again.' })), () => {}), /Try again/);
  await assert.rejects(readAnswerStream(new Response(JSON.stringify({ detail: 'Invalid period.' }), { status: 422 }), () => {}), /Invalid period/);
});

test('comments and CRLF frames do not interfere with the reply', async () => {
  const response = new Response(': ready\r\n\r\n' + event('done', answer).replaceAll('\n', '\r\n'));
  assert.deepEqual(await readAnswerStream(response, () => {}), answer);
});
