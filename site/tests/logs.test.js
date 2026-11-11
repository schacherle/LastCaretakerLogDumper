const test = require('node:test');
const assert = require('node:assert/strict');
const { loadAppContext, toPlain } = require('./helpers/app-context.js');

test('logs domain logic: normalizeLogs and normalizeArrayJson', async (t) => {
  const ctx = loadAppContext();
  const { normalizeLogs, normalizeArrayJson, logPageKey, subtitlePageKey } = ctx;

  await t.test('normalizeLogs unpacks both array payloads and object wrappers', () => {
    // Array payload
    const rawArray = [{ id: 'Log_1', title: 'First Log' }];
    const norm1 = normalizeLogs(rawArray);
    assert.strictEqual(norm1.buildNumber, null);
    assert.deepStrictEqual(toPlain(norm1.logs), rawArray);

    // Object wrapper with build_number and data
    const rawObj = {
      build_number: 650920,
      data: [{ id: 'Log_2', title: 'Second Log' }],
    };
    const norm2 = normalizeLogs(rawObj);
    assert.strictEqual(norm2.buildNumber, 650920);
    assert.deepStrictEqual(toPlain(norm2.logs), rawObj.data);

    // Empty / null payload
    const normNull = normalizeLogs(null);
    assert.strictEqual(normNull.buildNumber, null);
    assert.deepStrictEqual(toPlain(normNull.logs), []);
  });

  await t.test('normalizeArrayJson extracts array from direct or wrapped structures', () => {
    assert.deepStrictEqual(toPlain(normalizeArrayJson(['a', 'b'])), ['a', 'b']);
    assert.deepStrictEqual(toPlain(normalizeArrayJson({ data: ['c', 'd'] })), ['c', 'd']);
    assert.deepStrictEqual(toPlain(normalizeArrayJson(null)), []);
    assert.deepStrictEqual(toPlain(normalizeArrayJson({})), []);
  });

  await t.test('logPageKey and subtitlePageKey format link anchors accurately', () => {
    assert.strictEqual(logPageKey({ id: 'Frag_01' }, 0), 'page:Frag_01');
    assert.strictEqual(logPageKey(null, 2), 'page:3');
    assert.strictEqual(logPageKey({}, 4), 'page:5');

    assert.strictEqual(subtitlePageKey({ Name: 'CU3_3-1' }), 'part:CU3_3-1');
    assert.strictEqual(subtitlePageKey(null), 'part:');
  });
});
