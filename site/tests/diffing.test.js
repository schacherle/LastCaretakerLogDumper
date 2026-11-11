const test = require('node:test');
const assert = require('node:assert/strict');
const { loadAppContext, toPlain } = require('./helpers/app-context.js');

test('diffing logic: diffByKey and renderWordDiff', async (t) => {
  await t.test('diffByKey accurately calculates added, removed, and changed items', () => {
    const ctx = loadAppContext();
    const { diffByKey } = ctx;

    const fromList = [
      { id: '1', name: 'Item 1', val: 'old' },
      { id: '2', name: 'Item 2', val: 'same' },
      { id: '3', name: 'Item 3', val: 'to delete' },
    ];

    const toList = [
      { id: '1', name: 'Item 1', val: 'new' }, // changed
      { id: '2', name: 'Item 2', val: 'same' }, // untouched
      { id: '4', name: 'Item 4', val: 'brand new' }, // added
    ];

    const { added, removed, changed } = diffByKey(fromList, toList, (x) => x.id);

    assert.strictEqual(added.length, 1);
    assert.strictEqual(added[0].id, '4');

    assert.strictEqual(removed.length, 1);
    assert.strictEqual(removed[0].id, '3');

    assert.strictEqual(changed.length, 1);
    assert.strictEqual(changed[0].key, '1');
    assert.strictEqual(changed[0].from.val, 'old');
    assert.strictEqual(changed[0].to.val, 'new');
  });

  await t.test('diffByKey handles empty inputs gracefully', () => {
    const ctx = loadAppContext();
    const { diffByKey } = ctx;

    const diff1 = diffByKey([], [], (x) => x.id);
    assert.deepStrictEqual(toPlain(diff1), { added: [], removed: [], changed: [] });

    const diff2 = diffByKey([{ id: 'a' }], [], (x) => x.id);
    assert.strictEqual(diff2.removed.length, 1);
    assert.strictEqual(diff2.added.length, 0);
    assert.strictEqual(diff2.changed.length, 0);

    const diff3 = diffByKey([], [{ id: 'b' }], (x) => x.id);
    assert.strictEqual(diff3.added.length, 1);
    assert.strictEqual(diff3.removed.length, 0);
    assert.strictEqual(diff3.changed.length, 0);
  });

  await t.test('renderWordDiff returns identical text directly without diff tags', () => {
    const ctx = loadAppContext();
    const { renderWordDiff } = ctx;

    assert.strictEqual(renderWordDiff('Alpha Beta', 'Alpha Beta'), 'Alpha Beta');
    assert.strictEqual(renderWordDiff('', ''), '');
    assert.strictEqual(renderWordDiff(null, null), '');
  });

  await t.test('renderWordDiff falls back to simple arrow when Diff library is undefined', () => {
    const ctx = loadAppContext();
    const { renderWordDiff } = ctx;

    const diff = renderWordDiff('old text', 'new text');
    assert.strictEqual(diff, 'old text → new text');
  });

  await t.test('renderWordDiff escapes HTML in fallback arrow mode', () => {
    const ctx = loadAppContext();
    const { renderWordDiff } = ctx;

    const diff = renderWordDiff('<b>old</b>', '<i>new</i>');
    assert.strictEqual(diff, '&lt;b&gt;old&lt;/b&gt; → &lt;i&gt;new&lt;/i&gt;');
  });

  await t.test('renderWordDiff uses Diff.diffWords when Diff global is present', () => {
    const mockDiff = {
      diffWords(oldStr, newStr) {
        return [
          { value: 'hello ', added: false, removed: false },
          { value: 'world', removed: true },
          { value: 'universe', added: true },
        ];
      },
    };

    const ctx = loadAppContext({
      extraGlobals: { Diff: mockDiff },
    });
    const { renderWordDiff } = ctx;

    const rendered = renderWordDiff('hello world', 'hello universe');
    assert.strictEqual(rendered, 'hello <del class="diff-del">world</del><ins class="diff-ins">universe</ins>');
  });
});
