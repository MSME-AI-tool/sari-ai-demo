import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dictate } from '../src/dictation.ts';

class Speech {
  static latest;
  constructor() { Speech.latest = this; }
  start() { this.started = true; }
  stop() { this.stopped = true; }
  abort() { this.aborted = true; }
  result(rows) { this.onresult?.({ results: rows.map(([transcript, isFinal]) => Object.assign([{ transcript }], { isFinal })) }); }
}
function setup(base = 'Sales today') {
  const output = { text: base, interim: '', errors: [], ends: 0 };
  const controller = dictate(Speech, { base, language: 'fil-PH', onText: text => output.text = text,
    onInterim: text => output.interim = text, onError: error => output.errors.push(error), onEnd: () => output.ends++ });
  return { controller, session: Speech.latest, output };
}

test('preserves typed text, keeps interim separate, and never duplicates final results', () => {
  const { session, output } = setup();
  assert.equal(session.lang, 'fil-PH');
  assert.equal(session.continuous, true);
  assert.equal(session.interimResults, true);
  session.result([['sold two Sardines', false]]);
  assert.equal(output.text, 'Sales today');
  assert.equal(output.interim, 'sold two Sardines');
  session.result([['sold two Sardines', true], ['and', false]]);
  session.result([['sold two Sardines', true], ['and three noodles', true]]);
  assert.equal(output.text, 'Sales today sold two Sardines and three noodles');
  assert.equal(output.interim, '');
});
test('stop flushes the last phrase before ending', () => {
  const { controller, session, output } = setup('');
  controller.stop();
  assert.equal(session.stopped, true);
  assert.equal(session.aborted, undefined);
  session.result([['sixteen Sardines sold today', true]]);
  session.onend();
  assert.equal(output.text, 'sixteen Sardines sold today');
  assert.equal(output.ends, 1);
});
test('cancellation prevents late results from replacing a reset or unmounted entry', () => {
  const { controller, session, output } = setup();
  const lateResult = session.onresult;
  controller.cancel();
  lateResult({ results: [Object.assign([{ transcript: 'unwanted' }], { isFinal: true })] });
  assert.equal(session.aborted, true);
  assert.equal(output.text, 'Sales today');
  assert.equal(output.ends, 0);
});
test('permission and network errors retain completed words and end once', () => {
  for (const error of ['not-allowed', 'network', 'no-speech', 'language-not-supported']) {
    const { session, output } = setup();
    session.result([['sold two Sardines', true]]);
    session.onerror({ error });
    session.onend();
    assert.equal(output.text, 'Sales today sold two Sardines');
    assert.deepEqual(output.errors, [error]);
    assert.equal(output.ends, 1);
  }
});
test('a browser start failure restores the input state', () => {
  class BrokenSpeech extends Speech { start() { throw new Error('blocked'); } }
  let ended = false, error;
  dictate(BrokenSpeech, { base: '', language: 'en-PH', onText() {}, onInterim() {},
    onError(code) { error = code; }, onEnd() { ended = true; } });
  assert.equal(error, 'start-failed');
  assert.equal(ended, true);
});
