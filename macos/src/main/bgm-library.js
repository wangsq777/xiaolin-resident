const fs = require('node:fs/promises');
const path = require('node:path');

const SUPPORTED_AUDIO_EXTENSIONS = new Set([
  '.mp3', '.m4a', '.aac', '.wav', '.flac', '.ogg', '.opus'
]);

async function ensureBgmDirectory(directory) {
  await fs.mkdir(directory, { recursive: true });
  return directory;
}

async function listBgmTracks(directory) {
  await ensureBgmDirectory(directory);
  const entries = await fs.readdir(directory, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile() && isSupportedAudioFile(entry.name))
    .sort((left, right) => left.name.localeCompare(right.name, 'zh-CN', {
      numeric: true,
      sensitivity: 'base'
    }))
    .map((entry) => {
      const metadata = parseTrackName(entry.name);
      return {
        id: encodeURIComponent(entry.name),
        fileName: entry.name,
        title: metadata.title,
        artist: metadata.artist,
        url: `xiaolin-bgm://track/${encodeURIComponent(entry.name)}`
      };
    });
}

function resolveBgmTrack(directory, encodedFileName) {
  const fileName = decodeURIComponent(String(encodedFileName || ''));
  if (!fileName || path.basename(fileName) !== fileName || !isSupportedAudioFile(fileName)) {
    throw new Error('BGM 文件名无效。');
  }

  const resolvedDirectory = path.resolve(directory);
  const resolvedFile = path.resolve(resolvedDirectory, fileName);
  if (path.dirname(resolvedFile) !== resolvedDirectory) {
    throw new Error('BGM 文件路径越界。');
  }
  return resolvedFile;
}

function isSupportedAudioFile(fileName) {
  return SUPPORTED_AUDIO_EXTENSIONS.has(path.extname(fileName).toLowerCase());
}

function parseTrackName(fileName) {
  const baseName = path.basename(fileName, path.extname(fileName))
    .replace(/^\s*\d+[._ -]+/, '')
    .trim();
  const parts = baseName.split(/\s+-\s+/).filter(Boolean);

  if (parts.length >= 2) {
    return {
      artist: parts.shift(),
      title: parts.join(' - ')
    };
  }

  return {
    title: baseName || '未命名 BGM',
    artist: '本地 BGM'
  };
}

module.exports = {
  SUPPORTED_AUDIO_EXTENSIONS,
  ensureBgmDirectory,
  isSupportedAudioFile,
  listBgmTracks,
  parseTrackName,
  resolveBgmTrack
};
