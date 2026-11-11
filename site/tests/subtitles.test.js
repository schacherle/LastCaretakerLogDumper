const test = require('node:test');
const assert = require('node:assert/strict');
const { loadAppContext, toPlain } = require('./helpers/app-context.js');

test('subtitles domain logic: parsing, part labeling, number extraction, and grouping', async (t) => {
  const ctx = loadAppContext();
  const { subtitleGroupKey, subtitlePartLabel, subtitlePartNumber, groupSubtitles } = ctx;

  await t.test('subtitleGroupKey extracts storyline prefix before hyphen and part', () => {
    assert.strictEqual(subtitleGroupKey('CU3_3-1'), 'CU3_3');
    assert.strictEqual(subtitleGroupKey('CU3_3-12'), 'CU3_3');
    assert.strictEqual(subtitleGroupKey('Quest_Alpha-2b'), 'Quest_Alpha');
    assert.strictEqual(subtitleGroupKey('StandaloneName'), 'StandaloneName');
    assert.strictEqual(subtitleGroupKey(''), '');
    assert.strictEqual(subtitleGroupKey(null), '');
  });

  await t.test('subtitlePartLabel extracts suffix following hyphen', () => {
    assert.strictEqual(subtitlePartLabel('CU3_3-1'), '1');
    assert.strictEqual(subtitlePartLabel('CU3_3-6'), '6');
    assert.strictEqual(subtitlePartLabel('CU3_3-2_Anna_B'), '2_Anna_B');
    assert.strictEqual(subtitlePartLabel('CU3_3-1a'), '1a');
    assert.strictEqual(subtitlePartLabel('Standalone'), '');
    assert.strictEqual(subtitlePartLabel(''), '');
    assert.strictEqual(subtitlePartLabel(undefined), '');
  });

  await t.test('subtitlePartNumber parses integer for ordering with fallbacks', () => {
    assert.strictEqual(subtitlePartNumber('CU3_3-1'), 1);
    assert.strictEqual(subtitlePartNumber('CU3_3-10'), 10);
    assert.strictEqual(subtitlePartNumber('CU3_3-2_Anna_B'), 2);
    assert.strictEqual(subtitlePartNumber('CU3_3-03'), 3);
    assert.strictEqual(subtitlePartNumber('Standalone'), 0);
    assert.strictEqual(subtitlePartNumber(''), 0);
    assert.strictEqual(subtitlePartNumber(null), 0);
  });

  await t.test('groupSubtitles preserves storyline order and sorts parts numerically', () => {
    const rawSubs = [
      { Name: 'StoryB-2', Subtitle: 'Story B part 2', Duration: 3.5 },
      { Name: 'StoryA-10', Subtitle: 'Story A part 10', Duration: 1.0 },
      { Name: 'StoryB-1', Subtitle: 'Story B part 1', Duration: 2.0 },
      { Name: 'StoryA-2', Subtitle: 'Story A part 2', Duration: 4.0 },
      { Name: 'StoryA-1', Subtitle: 'Story A part 1', Duration: 1.5 },
    ];

    const grouped = groupSubtitles(rawSubs);

    assert.strictEqual(grouped.length, 2);

    // Order of groups follows first occurrence: StoryB first, then StoryA
    assert.strictEqual(grouped[0].key, 'StoryB');
    assert.strictEqual(grouped[0].items.length, 2);
    assert.strictEqual(grouped[0].items[0].Name, 'StoryB-1');
    assert.strictEqual(grouped[0].items[1].Name, 'StoryB-2');
    assert.strictEqual(grouped[0].totalDuration, 5.5);

    assert.strictEqual(grouped[1].key, 'StoryA');
    assert.strictEqual(grouped[1].items.length, 3);
    // Verified numerical sorting (1, 2, 10 instead of lexical 1, 10, 2)
    assert.strictEqual(grouped[1].items[0].Name, 'StoryA-1');
    assert.strictEqual(grouped[1].items[1].Name, 'StoryA-2');
    assert.strictEqual(grouped[1].items[2].Name, 'StoryA-10');
    assert.strictEqual(grouped[1].totalDuration, 6.5);
  });

  await t.test('groupSubtitles handles empty lists and missing durations cleanly', () => {
    const emptyGroup = groupSubtitles([]);
    assert.deepStrictEqual(toPlain(emptyGroup), []);

    const missingDuration = groupSubtitles([
      { Name: 'Solo-1', Subtitle: 'No duration' },
      { Name: 'Solo-2', Subtitle: 'Zero duration', Duration: 0 },
    ]);
    assert.strictEqual(missingDuration.length, 1);
    assert.strictEqual(missingDuration[0].totalDuration, 0);
  });
});
