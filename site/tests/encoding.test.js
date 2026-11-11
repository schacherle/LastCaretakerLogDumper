const test = require('node:test');
const assert = require('node:assert/strict');
const { loadAppContext } = require('./helpers/app-context.js');

test('decodeArrayBuffer handles diverse encodings and byte order marks', async (t) => {
  const ctx = loadAppContext();
  const { decodeArrayBuffer } = ctx;

  await t.test('decodes standard UTF-8 buffer without BOM', () => {
    const encoder = new TextEncoder();
    const str = 'Hello Last Caretaker';
    const buf = encoder.encode(str).buffer;
    const result = decodeArrayBuffer(buf);
    assert.strictEqual(result, str);
  });

  await t.test('decodes UTF-8 buffer with BOM (0xEF, 0xBB, 0xBF)', () => {
    const encoder = new TextEncoder();
    const payload = encoder.encode('{"key": "value"}');
    const bomPayload = new Uint8Array(3 + payload.length);
    bomPayload.set([0xef, 0xbb, 0xbf], 0);
    bomPayload.set(payload, 3);

    const result = decodeArrayBuffer(bomPayload.buffer);
    assert.strictEqual(result, '{"key": "value"}');
    assert.doesNotThrow(() => JSON.parse(result));
  });

  await t.test('decodes UTF-16 LE buffer with BOM (0xFF, 0xFE)', () => {
    // UTF-16 LE: byte pair for 'A' (0x0041) is [0x41, 0x00], 'B' is [0x42, 0x00]
    const bytes = new Uint8Array([0xff, 0xfe, 0x41, 0x00, 0x42, 0x00]);
    const result = decodeArrayBuffer(bytes.buffer);
    assert.strictEqual(result, 'AB');
  });

  await t.test('decodes UTF-16 BE buffer with BOM (0xFE, 0xFF)', () => {
    // UTF-16 BE: byte pair for 'A' (0x0041) is [0x00, 0x41], 'B' is [0x00, 0x42]
    const bytes = new Uint8Array([0xfe, 0xff, 0x00, 0x41, 0x00, 0x42]);
    const result = decodeArrayBuffer(bytes.buffer);
    assert.strictEqual(result, 'AB');
  });

  await t.test('handles empty ArrayBuffer gracefully', () => {
    const emptyBuf = new Uint8Array(0).buffer;
    const result = decodeArrayBuffer(emptyBuf);
    assert.strictEqual(result, '');
  });

  await t.test('handles single-byte buffer without crashing', () => {
    const single = new Uint8Array([0x61]).buffer; // 'a'
    const result = decodeArrayBuffer(single);
    assert.strictEqual(result, 'a');
  });
});
