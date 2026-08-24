const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  listBgmTracks,
  parseTrackName,
  resolveBgmTrack
} = require('../src/main/bgm-library');

test('lists supported BGM files in natural order', async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'xiaolin-bgm-'));
  context.after(() => fs.rm(directory, { recursive: true, force: true }));

  await Promise.all([
    fs.writeFile(path.join(directory, '10 - 林家谦 - 第二首.flac'), ''),
    fs.writeFile(path.join(directory, '2 - 林家谦 - 第一首.mp3'), ''),
    fs.writeFile(path.join(directory, '封面.png'), '')
  ]);

  const tracks = await listBgmTracks(directory);
  assert.equal(tracks.length, 2);
  assert.equal(tracks[0].title, '第一首');
  assert.equal(tracks[0].artist, '林家谦');
  assert.match(tracks[0].url, /^xiaolin-bgm:\/\/track\//);
});

test('parses plain filenames and artist-title filenames', () => {
  assert.deepEqual(parseTrackName('林家谦 - 一人之境.m4a'), {
    artist: '林家谦',
    title: '一人之境'
  });
  assert.deepEqual(parseTrackName('某首歌.mp3'), {
    artist: '本地 BGM',
    title: '某首歌'
  });
});

test('rejects unsupported files and path traversal', () => {
  const directory = path.join(os.tmpdir(), 'xiaolin-bgm-safe');
  assert.throws(() => resolveBgmTrack(directory, '..%2Fsecret.mp3'), /无效|越界/);
  assert.throws(() => resolveBgmTrack(directory, 'notes.txt'), /无效/);
});
