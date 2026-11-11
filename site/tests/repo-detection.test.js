const test = require('node:test');
const assert = require('node:assert/strict');
const { loadAppContext } = require('./helpers/app-context.js');

test('detectRepo resolves repository identifier from url query or github.io hostname', async (t) => {
  await t.test('prefers ?repo= query parameter override when present', () => {
    const ctx = loadAppContext({
      search: '?repo=the1killer/LastCaretakerLogDumper&other=1',
      hostname: 'schacherle.github.io',
      pathname: '/custom-path/',
    });
    assert.strictEqual(ctx.detectRepo(), 'the1killer/LastCaretakerLogDumper');
    assert.strictEqual(ctx.evalInContext('REPO'), 'the1killer/LastCaretakerLogDumper');
  });

  await t.test('extracts <owner>/<repo> from standard github.io hosting', () => {
    const ctx = loadAppContext({
      search: '',
      hostname: 'schacherle.github.io',
      pathname: '/LastCaretakerLogDumper/',
    });
    assert.strictEqual(ctx.detectRepo(), 'schacherle/LastCaretakerLogDumper');
    assert.strictEqual(ctx.evalInContext('REPO'), 'schacherle/LastCaretakerLogDumper');
  });

  await t.test('extracts correctly with nested pathname segments', () => {
    const ctx = loadAppContext({
      search: '',
      hostname: 'my-org.github.io',
      pathname: '/repo-name/subfolder/index.html',
    });
    assert.strictEqual(ctx.detectRepo(), 'my-org/repo-name');
  });

  await t.test('returns null when on github.io root without repository pathname', () => {
    const ctx = loadAppContext({
      search: '',
      hostname: 'owner.github.io',
      pathname: '/',
    });
    assert.strictEqual(ctx.detectRepo(), null);
    assert.strictEqual(ctx.evalInContext('REPO'), null);
  });

  await t.test('returns null when running locally without ?repo= parameter', () => {
    const ctx = loadAppContext({
      search: '',
      hostname: 'localhost',
      pathname: '/',
    });
    assert.strictEqual(ctx.detectRepo(), null);
    assert.strictEqual(ctx.evalInContext('REPO'), null);
  });

  await t.test('returns null on arbitrary non-github domains without ?repo=', () => {
    const ctx = loadAppContext({
      search: '',
      hostname: 'example.com',
      pathname: '/app/',
    });
    assert.strictEqual(ctx.detectRepo(), null);
  });
});
