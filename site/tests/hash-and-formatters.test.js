const test = require('node:test');
const assert = require('node:assert/strict');
const { loadAppContext } = require('./helpers/app-context.js');

test('hash and formatters: escaping, string trimming, dates, durations, and URL hash routing', async (t) => {
  const ctx = loadAppContext();
  const {
    escapeHtml,
    formatDuration,
    formatDate,
    firstLine,
    normalizeSelectedText,
    trimmedSelectionText,
    hashValue,
    shortSha,
    resolveVersionSha,
    parseBrowseHash,
    buildBrowseHash,
  } = ctx;

  await t.test('escapeHtml properly escapes dangerous HTML characters', () => {
    assert.strictEqual(escapeHtml('<script>alert("xss")&\'test\'</script>'), '&lt;script&gt;alert(&quot;xss&quot;)&amp;&#39;test&#39;&lt;/script&gt;');
    assert.strictEqual(escapeHtml(null), '');
    assert.strictEqual(escapeHtml(undefined), '');
    assert.strictEqual(escapeHtml(123), '123');
  });

  await t.test('formatDuration formats floating second durations with 1 decimal place', () => {
    assert.strictEqual(formatDuration(3.14159), '3.1s');
    assert.strictEqual(formatDuration(10), '10.0s');
    assert.strictEqual(formatDuration(0), '0.0s');
    assert.strictEqual(formatDuration(null), '');
    assert.strictEqual(formatDuration('string'), '');
  });

  await t.test('formatDate extracts ISO date part YYYY-MM-DD', () => {
    assert.strictEqual(formatDate('2025-05-18T14:32:00Z'), '2025-05-18');
    assert.strictEqual(formatDate('2024-11-01'), '2024-11-01');
    assert.strictEqual(formatDate(''), '');
    assert.strictEqual(formatDate(null), '');
  });

  await t.test('firstLine returns first line trimmed to 70 characters with ellipsis', () => {
    assert.strictEqual(firstLine('Line 1\nLine 2'), 'Line 1');
    const longLine = 'A'.repeat(80);
    const result = firstLine(longLine);
    assert.strictEqual(result.length, 68); // 67 + '…'
    assert.strictEqual(result.endsWith('…'), true);
  });

  await t.test('normalizeSelectedText condenses whitespace and trims', () => {
    assert.strictEqual(normalizeSelectedText('  hello   world  \n  test  '), 'hello world test');
    assert.strictEqual(normalizeSelectedText(null), '');
  });

  await t.test('trimmedSelectionText limits string to 200 characters with ellipsis', () => {
    const text250 = 'B'.repeat(250);
    const trimmed = trimmedSelectionText(text250);
    assert.strictEqual(trimmed.length, 198); // 197 + '…'
    assert.strictEqual(trimmed.endsWith('…'), true);

    assert.strictEqual(trimmedSelectionText('Short text'), 'Short text');
  });

  await t.test('shortSha truncates string to 7 characters', () => {
    assert.strictEqual(shortSha('4da9eda89f2a71d87e09886a1005b6370e53a992'), '4da9eda');
    assert.strictEqual(shortSha('1234'), '1234');
    assert.strictEqual(shortSha(null), '');
  });

  await t.test('resolveVersionSha resolves full or prefix sha against versions list', () => {
    ctx.evalInContext(`
      versions = [
        { sha: 'abcdef1234567890abcdef1234567890abcdef12', message: 'First', date: '2025-01-01' },
        { sha: '1234567890abcdef1234567890abcdef12345678', message: 'Second', date: '2025-01-02' },
        { sha: '1234567890aabbcc1234567890abcdef12345678', message: 'Duplicate prefix', date: '2025-01-03' },
      ];
    `);

    // Exact match
    assert.strictEqual(
      resolveVersionSha('abcdef1234567890abcdef1234567890abcdef12'),
      'abcdef1234567890abcdef1234567890abcdef12'
    );

    // Unique prefix match
    assert.strictEqual(resolveVersionSha('abcdef'), 'abcdef1234567890abcdef1234567890abcdef12');

    // Ambiguous prefix returns empty string
    assert.strictEqual(resolveVersionSha('1234567890'), '');

    // Non-existent sha returns empty string
    assert.strictEqual(resolveVersionSha('9999999'), '');
    assert.strictEqual(resolveVersionSha(''), '');
  });

  await t.test('parseBrowseHash correctly parses hash params into browse state', () => {
    const hashCtx = loadAppContext({
      hash: '#mode=browse&scope=subtitles&version=4da9eda&entry=CU3_3&page=part:CU3_3-1&text=Hello+World',
    });
    const parsed = hashCtx.parseBrowseHash();

    assert.strictEqual(parsed.scope, 'subtitles');
    assert.strictEqual(parsed.version, '4da9eda');
    assert.strictEqual(parsed.entry, 'CU3_3');
    assert.strictEqual(parsed.page, 'part:CU3_3-1');
    assert.strictEqual(parsed.text, 'Hello World');
    assert.strictEqual(parsed.unlocked, false);
  });

  await t.test('parseBrowseHash rejects non-browse modes and unknown scopes', () => {
    const compareCtx = loadAppContext({ hash: '#mode=compare' });
    assert.strictEqual(compareCtx.parseBrowseHash(), null);

    const unknownScopeCtx = loadAppContext({ hash: '#mode=browse&scope=unknown_scope' });
    const parsed = unknownScopeCtx.parseBrowseHash();
    assert.strictEqual(parsed.scope, 'logs'); // falls back to default 'logs'
  });

  await t.test('buildBrowseHash generates matching query parameter hash', () => {
    ctx.evalInContext(`
      browseScope = 'sampledata';
      sampleScope = 'field';
      currentBrowseSha = '4da9eda89f2a71d87e09886a1005b6370e53a992';
      selectedSampleKey = '13';
      unlockedSamples.add('13');
    `);

    const hashStr = buildBrowseHash({ page: 'field-reading', text: 'Important observation' });
    const params = new URLSearchParams(hashStr);

    assert.strictEqual(params.get('mode'), 'browse');
    assert.strictEqual(params.get('scope'), 'sampledata');
    assert.strictEqual(params.get('sampleScope'), 'field');
    assert.strictEqual(params.get('version'), '4da9eda');
    assert.strictEqual(params.get('entry'), '13');
    assert.strictEqual(params.get('page'), 'field-reading');
    assert.strictEqual(params.get('text'), 'Important observation');
    assert.strictEqual(params.get('unlocked'), '1');
  });
});
