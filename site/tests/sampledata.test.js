const test = require('node:test');
const assert = require('node:assert/strict');
const { loadAppContext, toPlain } = require('./helpers/app-context.js');

test('sample data logic: codes, site labels, sorting keys, and text dump merging', async (t) => {
  const ctx = loadAppContext();
  const {
    sampleCode,
    sampleSiteLabel,
    sampleIdSortKey,
    compareSampleIds,
    mergeSampleDataText,
  } = ctx;

  await t.test('sampleCode formats field collection as SD-### and cave as CAVE-###', () => {
    assert.strictEqual(sampleCode({ id: 5, collection: 'field' }), 'SD-005');
    assert.strictEqual(sampleCode({ id: 42, collection: 'field' }), 'SD-042');
    assert.strictEqual(sampleCode({ id: 104, collection: 'field' }), 'SD-104');
    assert.strictEqual(sampleCode({ id: 'CavePainting_3', collection: 'cave' }), 'CAVE-003');
    assert.strictEqual(sampleCode({ id: 'CavePainting_12', collection: 'cave' }), 'CAVE-012');
  });

  await t.test('sampleSiteLabel returns Orbit archive for cave or site value with fallback', () => {
    assert.strictEqual(sampleSiteLabel({ collection: 'cave', site: 'ignored' }), 'Orbit archive');
    assert.strictEqual(sampleSiteLabel({ collection: 'field', site: 'Bio-Dome B' }), 'Bio-Dome B');
    assert.strictEqual(sampleSiteLabel({ collection: 'field', site: '' }), '—');
    assert.strictEqual(sampleSiteLabel({ collection: 'field' }), '—');
  });

  await t.test('sampleIdSortKey extracts type tier and integer value for stable sorting', () => {
    // Normal field samples: tier 0
    assert.deepStrictEqual(toPlain(sampleIdSortKey('DA_SampleData_1')), [0, 1]);
    assert.deepStrictEqual(toPlain(sampleIdSortKey('DA_SampleData_131')), [0, 131]);
    assert.deepStrictEqual(toPlain(sampleIdSortKey('DA_SampleData_09')), [0, 9]);

    // Cave paintings: tier 1
    assert.deepStrictEqual(toPlain(sampleIdSortKey('DA_SampleData_CavePainting_1')), [1, 1]);
    assert.deepStrictEqual(toPlain(sampleIdSortKey('DA_SampleData_CavePainting_12')), [1, 12]);

    // Unknown/unmatched formats: tier 2
    assert.deepStrictEqual(toPlain(sampleIdSortKey('Other_Data_Format')), [2, 0]);
    assert.deepStrictEqual(toPlain(sampleIdSortKey(null)), [2, 0]);
  });

  await t.test('compareSampleIds sorts field samples numerically then cave paintings numerically', () => {
    const ids = [
      'DA_SampleData_CavePainting_12',
      'DA_SampleData_131',
      'DA_SampleData_2',
      'DA_SampleData_CavePainting_3',
      'DA_SampleData_104',
      'DA_SampleData_20',
    ];

    ids.sort(compareSampleIds);

    assert.deepStrictEqual(ids, [
      'DA_SampleData_2',
      'DA_SampleData_20',
      'DA_SampleData_104',
      'DA_SampleData_131',
      'DA_SampleData_CavePainting_3',
      'DA_SampleData_CavePainting_12',
    ]);
  });

  await t.test('mergeSampleDataText enriches curated samples with dumped sentDescription', () => {
    const curated = [
      { id: 1, title: 'Sample One', short: 'Short 1', unlock: 'Hand-authored fallback' },
      { id: 2, title: 'Sample Two', short: 'Short 2' },
      { id: 3, title: 'Sample Three', short: 'Short 3', unlock: 'Keep if no dump match' },
    ];

    const textDump = [
      { id: 'DA_SampleData_1', sentDescription: 'Engine dump unlock text 1' },
      { id: 'DA_SampleData_2', sentDescription: 'Engine dump unlock text 2' },
      { id: 'DA_SampleData_99', sentDescription: 'Irrelevant id' },
    ];

    const merged = mergeSampleDataText(curated, textDump);

    assert.strictEqual(merged.length, 3);
    assert.strictEqual(merged[0].unlock, 'Engine dump unlock text 1');
    assert.strictEqual(merged[1].unlock, 'Engine dump unlock text 2');
    assert.strictEqual(merged[2].unlock, 'Keep if no dump match');
  });

  await t.test('mergeSampleDataText ignores dump records with empty sentDescription', () => {
    const curated = [
      { id: 5, title: 'Sample Five', unlock: 'Original unlock' },
    ];
    const textDump = [
      { id: 'DA_SampleData_5', sentDescription: '' },
    ];

    const merged = mergeSampleDataText(curated, textDump);
    assert.strictEqual(merged[0].unlock, 'Original unlock');
  });
});
