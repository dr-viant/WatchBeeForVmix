// watcher.js

const sea = require('node:sea');

if (sea.isSea()) {
  const { createRequire } = require('node:module');
  require = createRequire(__filename);
}

const chokidar = require('chokidar');
const axios = require('axios');
const path = require('path');
const fs = require('fs');

function normalizeResolvedPath(inputPath) {
  const resolved = path.resolve(inputPath);
  const root = path.parse(resolved).root;
  return resolved.length > root.length
    ? resolved.replace(/[\\/]+$/, '')
    : resolved;
}

function normalizeComparisonPath(inputPath) {
  if (typeof inputPath !== 'string' || inputPath.trim() === '') {
    return null;
  }

  const normalized = normalizeResolvedPath(inputPath.replace(/\\/g, path.sep));
  if (process.platform === 'win32') {
    return normalized.toLowerCase();
  }
  return normalized;
}

function decodeVmixItemPath(rawItem) {
  if (typeof rawItem !== 'string' || rawItem.trim() === '') {
    return null;
  }

  let value = rawItem.trim();
  try {
    value = decodeURIComponent(value);
  } catch {
    // Keep original string if the item has malformed percent-encoding.
  }

  value = value.replace(/^file:\/\//i, '');
  return normalizeComparisonPath(value);
}

function normalizeConfigPath(baseDir, inputPath) {
  const resolved = path.isAbsolute(inputPath)
    ? inputPath
    : path.join(baseDir, inputPath);
  return normalizeResolvedPath(resolved);
}

function normalizeFolderConfig(baseDir, folderToWatch) {
  const folderList = Array.isArray(folderToWatch)
    ? folderToWatch
    : [folderToWatch];
  const normalized = folderList
    .filter((folder) => typeof folder === 'string' && folder.trim() !== '')
    .map((folder) => normalizeConfigPath(baseDir, folder));

  if (Array.isArray(folderToWatch)) {
    return normalized;
  }

  return normalized[0] || normalizeConfigPath(baseDir, './media');
}

function normalizePlaylistMap(baseDir, playlistMap) {
  if (!playlistMap || typeof playlistMap !== 'object' || Array.isArray(playlistMap)) {
    return {};
  }

  const normalizePlaylistNames = (playlistValue) => {
    const values = Array.isArray(playlistValue)
      ? playlistValue
      : [playlistValue];
    const names = [];
    const seen = new Set();

    for (const value of values) {
      if (typeof value !== 'string') {
        continue;
      }

      const trimmed = value.trim();
      if (trimmed === '' || seen.has(trimmed)) {
        continue;
      }

      seen.add(trimmed);
      names.push(trimmed);
    }

    return names;
  };

  const normalized = {};
  for (const [folderPath, playlistValue] of Object.entries(playlistMap)) {
    const playlistNames = normalizePlaylistNames(playlistValue);
    if (playlistNames.length === 0) {
      continue;
    }

    const normalizedFolder = normalizeConfigPath(baseDir, folderPath).toLowerCase();
    normalized[normalizedFolder] = playlistNames;
  }

  return normalized;
}

function normalizeRuntimeConfig(baseDir, config) {
  const normalizedConfig = { ...config };
  normalizedConfig.folderToWatch = normalizeFolderConfig(baseDir, config.folderToWatch);
  normalizedConfig.playlistMap = normalizePlaylistMap(baseDir, config.playlistMap);
  return normalizedConfig;
}

function toPlaylistNames(playlistValue) {
  const values = Array.isArray(playlistValue)
    ? playlistValue
    : [playlistValue];
  const names = [];
  const seen = new Set();

  for (const value of values) {
    if (typeof value !== 'string') {
      continue;
    }

    const trimmed = value.trim();
    if (trimmed === '' || seen.has(trimmed)) {
      continue;
    }

    seen.add(trimmed);
    names.push(trimmed);
  }

  return names;
}

function getMappedPlaylistNames(config, normalizedFolderLower) {
  const directMatch = toPlaylistNames(config.playlistMap?.[normalizedFolderLower]);
  if (directMatch.length > 0) {
    return directMatch;
  }

  if (!config.playlistMap || typeof config.playlistMap !== 'object' || Array.isArray(config.playlistMap)) {
    return [];
  }

  for (const [folderPath, playlistValue] of Object.entries(config.playlistMap)) {
    const playlistNames = toPlaylistNames(playlistValue);
    if (playlistNames.length === 0) {
      continue;
    }

    const normalizedKey = normalizeResolvedPath(folderPath).toLowerCase();
    if (normalizedKey === normalizedFolderLower) {
      return playlistNames;
    }
  }

  return [];
}

function getBaseDir() {
  // Når koden er pakket som binary med nexe, er process.execPath exe’en
  if (process.pkg) {
    return path.dirname(process.execPath);
  }
  // Ved normal node-kørsel er __dirname scriptets folder
  return __dirname;
}

function loadConfig() {
  const baseDir = getBaseDir();
  const configPath = path.join(baseDir, 'config.json');

  let config;
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch {
    // fallback + skriv default config ved siden af exe'en
    config = {
      folderToWatch: path.join(baseDir, 'media'),
      vmixUrl: 'http://localhost:8088',
      supportedExtensions: ['.mp4', '.mov', '.wmv', '.avi', '.mpg', '.mpeg', '.mxf', '.mts'],
    };
    try {
      fs.writeFileSync(
        configPath,
        JSON.stringify(config, null, 2),
        'utf8',
      );
      console.log('Created default config.json');
    } catch (err) {
      console.error('Failed to write config.json:', err.message);
    }
  }

  config = normalizeRuntimeConfig(baseDir, config);

  return config;
}

const findListItems = async (xmlText, absolutePath) => {
    try {
        const listMatch = xmlText.match(/<input[^>]*type="VideoList"[^>]*>[\s\S]*?<list>([\s\S]*?)<\/list>/g);
        
        if (listMatch) {
            for (const list of listMatch) {
                const items = list.match(/<item[^>]*>(.*?)<\/item>/g);
                if (items) {
                    const index = items.findIndex(item => item.includes(absolutePath)) + 1;
                    if (index > 0) {
                        const titleMatch = list.match(/title="([^"]*?)"/);
                        const inputName = titleMatch ? titleMatch[1] : 'List';
                        return { index, inputName };
                    }
                }
            }
        }
        return null;
    } catch (error) {
        console.error(`Error parsing XML: ${error.message}`);
        return null;
    }
}

const getVmixState = async (vmixUrl) => {
    try {
        const response = await axios.get(`${vmixUrl}/api`);
        return response.data;
    } catch (error) {
        console.error(`Error getting vMix state: ${error.message}`);
        return null;
    }
}

function extractPlaylistItemsByName(xmlText) {
  const byPlaylist = new Map();
  if (typeof xmlText !== 'string' || xmlText.trim() === '') {
    return byPlaylist;
  }

  const listMatches = xmlText.match(/<input[^>]*type="VideoList"[^>]*>[\s\S]*?<\/input>/g) || [];
  for (const listXml of listMatches) {
    const titleMatch = listXml.match(/title="([^"]*?)"/);
    if (!titleMatch || typeof titleMatch[1] !== 'string' || titleMatch[1].trim() === '') {
      continue;
    }

    const playlistName = titleMatch[1];
    const listContentMatch = listXml.match(/<list>([\s\S]*?)<\/list>/);
    if (!listContentMatch) {
      byPlaylist.set(playlistName, new Set());
      continue;
    }

    const itemMatches = listContentMatch[1].match(/<item[^>]*>([\s\S]*?)<\/item>/g) || [];
    const normalizedItems = new Set();
    for (const itemXml of itemMatches) {
      const itemValueMatch = itemXml.match(/<item[^>]*>([\s\S]*?)<\/item>/);
      if (!itemValueMatch) {
        continue;
      }

      const normalizedItem = decodeVmixItemPath(itemValueMatch[1]);
      if (normalizedItem) {
        normalizedItems.add(normalizedItem);
      }
    }

    byPlaylist.set(playlistName, normalizedItems);
  }

  return byPlaylist;
}

function findListItemIndexInPlaylist(xmlText, inputName, absolutePath) {
  const listMatches = xmlText.match(/<input[^>]*type="VideoList"[^>]*>[\s\S]*?<\/input>/g) || [];
  const normalizedAbsolutePath = normalizeComparisonPath(absolutePath);

  for (const list of listMatches) {
    const titleMatch = list.match(/title="([^"]*?)"/);
    if (!titleMatch || titleMatch[1] !== inputName) {
      continue;
    }

    const items = list.match(/<item[^>]*>([\s\S]*?)<\/item>/g) || [];
    const matchedIndex = items.findIndex((itemXml) => {
      const valueMatch = itemXml.match(/<item[^>]*>([\s\S]*?)<\/item>/);
      if (!valueMatch) {
        return false;
      }

      return decodeVmixItemPath(valueMatch[1]) === normalizedAbsolutePath;
    });

    if (matchedIndex >= 0) {
      return matchedIndex + 1;
    }

    break;
  }

  return null;
}

async function buildStartupPlaylistIndex(config) {
  const index = new Map();
  const targetPlaylists = new Set();

  const folders = Array.isArray(config.folderToWatch)
    ? config.folderToWatch
    : [config.folderToWatch];
  for (const folder of folders) {
    if (typeof folder !== 'string' || folder.trim() === '') {
      continue;
    }

    const playlistNames = getPlaylistNames(config, normalizeResolvedPath(folder));
    for (const playlistName of playlistNames) {
      targetPlaylists.add(playlistName);
    }
  }

  for (const playlistName of targetPlaylists) {
    index.set(playlistName, new Set());
  }

  const xmlState = await getVmixState(config.vmixUrl);
  if (!xmlState) {
    return index;
  }

  const vmixItemsByPlaylist = extractPlaylistItemsByName(xmlState);
  for (const playlistName of targetPlaylists) {
    if (vmixItemsByPlaylist.has(playlistName)) {
      index.set(playlistName, vmixItemsByPlaylist.get(playlistName));
    }
  }

  return index;
}

function getPlaylistNames(config, absolutePath) {
  const folders = Array.isArray(config.folderToWatch)
    ? config.folderToWatch
    : [config.folderToWatch];

  const normalizedFile = normalizeResolvedPath(absolutePath).toLowerCase();
  let bestMatch = null;

  for (const folder of folders) {
    if (typeof folder !== 'string' || folder.trim() === '') {
      continue;
    }

    const normalizedFolder = normalizeResolvedPath(folder);
    const normalizedFolderLower = normalizedFolder.toLowerCase();
    const isMatch =
      normalizedFile === normalizedFolderLower ||
      normalizedFile.startsWith(`${normalizedFolderLower}${path.sep}`);

    if (!isMatch) {
      continue;
    }

    if (!bestMatch || normalizedFolderLower.length > bestMatch.normalizedFolderLower.length) {
      bestMatch = { normalizedFolder, normalizedFolderLower };
    }
  }

  if (bestMatch) {
    const mappedNames = getMappedPlaylistNames(config, bestMatch.normalizedFolderLower);
    if (mappedNames.length > 0) {
      return mappedNames;
    }

    return [path.basename(bestMatch.normalizedFolder)];
  }

  // Fallback: parent directory name
  return [path.basename(path.dirname(absolutePath))];
}

function getPlaylistName(config, absolutePath) {
  return getPlaylistNames(config, absolutePath)[0];
}

async function addToVmixPlaylist(config, filePath, targetPlaylistNames) {
  const ext = path.extname(filePath).toLowerCase();
  if (!config.supportedExtensions.includes(ext)) {
    console.log(`Ignoring ${filePath} - unsupported extension`);
    return false;
  }

  const absolutePath = path.resolve(filePath);
  const encodedPath = encodeURIComponent(absolutePath);
  const inputNames = Array.isArray(targetPlaylistNames) && targetPlaylistNames.length > 0
    ? targetPlaylistNames
    : getPlaylistNames(config, absolutePath);
  let allSucceeded = true;

  for (const inputName of inputNames) {
    try {
      const url = `${config.vmixUrl}/api/?Function=ListAdd&Input=${inputName}&Value=${encodedPath}`;
      await axios.get(url);
      console.log(`Added ${absolutePath} to vMix playlist: ${inputName}`);
    } catch (err) {
      console.error('Error adding to vMix:', err.message);
      allSucceeded = false;
    }
  }

  return allSucceeded;
}

    // Helper function to remove file from vMix playlist
const removeFromVmixPlaylist = async (config, filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  if (!config.supportedExtensions.includes(ext)) {
    console.log(`Ignoring ${filePath}, unsupported extension`);
    return false;
  }
    try {
      const absolutePath = path.resolve(filePath);
      const inputNames = getPlaylistNames(config, absolutePath);
      const xmlState = await getVmixState(config.vmixUrl);
      if (!xmlState) return false;

      let removedAny = false;
      for (const inputName of inputNames) {
        const indexToRemove = findListItemIndexInPlaylist(xmlState, inputName, absolutePath);
        if (!indexToRemove) {
          continue;
        }

        const url = `${config.vmixUrl}/api/?Function=ListRemove&Input=${inputName}&Value=${indexToRemove}`;
        await axios.get(url);
        console.log(`Removed ${absolutePath} from vMix playlist "${inputName}" at index ${indexToRemove}`);
        removedAny = true;
      }

      if (!removedAny) {
        console.log(`File ${absolutePath} not found in configured vMix playlists`);
      }

      return removedAny;
      } catch (error) {
          console.error(`Error removing file from vMix: ${error.message}`);
          return false;
      }
  }


function startWatcher(configOverride) {
  const rawConfig =
    configOverride !== undefined && configOverride !== null
      ? configOverride
      : loadConfig();
  const config = normalizeRuntimeConfig(getBaseDir(), rawConfig);

  console.log('Configuration:', config);
  console.log(`Watching ${config.folderToWatch} for changes...`);
  console.log(`vMix API URL: ${config.vmixUrl}`);

  const watcher = chokidar.watch(config.folderToWatch, {
    ignored: /(^|[\/\\])\../,
    persistent: true,
    awaitWriteFinish: {
      stabilityThreshold: 2000,
      pollInterval: 100,
    },
  });

  const startupPlaylistIndexPromise = buildStartupPlaylistIndex(config)
    .catch((error) => {
      console.error('Failed to build startup playlist index:', error.message);
      return new Map();
    });

  async function handleUpsertEvent(eventName, filePath) {
    console.log(`File ${eventName}:`, filePath);

    const absolutePath = normalizeResolvedPath(filePath);
    const inputNames = getPlaylistNames(config, absolutePath);
    const normalizedFile = normalizeComparisonPath(absolutePath);
    const startupPlaylistIndex = await startupPlaylistIndexPromise;

    const missingInputNames = [];
    for (const inputName of inputNames) {
      if (!startupPlaylistIndex.has(inputName)) {
        startupPlaylistIndex.set(inputName, new Set());
      }

      const playlistItems = startupPlaylistIndex.get(inputName);
      if (!normalizedFile || !playlistItems.has(normalizedFile)) {
        missingInputNames.push(inputName);
      }
    }

    if (missingInputNames.length === 0) {
      console.log(`Skipping ${absolutePath} - already present in configured vMix playlists: ${inputNames.join(', ')}`);
      return;
    }

    for (const inputName of missingInputNames) {
      const added = await addToVmixPlaylist(config, absolutePath, [inputName]);
      if (added && normalizedFile) {
        startupPlaylistIndex.get(inputName).add(normalizedFile);
      }
    }
  }

  watcher
    .on('add', (p) => {
      void handleUpsertEvent('added', p);
    })
    .on('change', (p) => {
      void handleUpsertEvent('changed', p);
    })
    .on('unlink', (p) => {
      console.log('File removed:', p);
      void (async () => {
        const removed = await removeFromVmixPlaylist(config, p);
        if (!removed) {
          return;
        }

        const absolutePath = normalizeResolvedPath(p);
        const inputNames = getPlaylistNames(config, absolutePath);
        const normalizedFile = normalizeComparisonPath(absolutePath);
        const startupPlaylistIndex = await startupPlaylistIndexPromise;

        for (const inputName of inputNames) {
          const playlistItems = startupPlaylistIndex.get(inputName);
          if (normalizedFile && playlistItems) {
            playlistItems.delete(normalizedFile);
          }
        }
      })();
    })
    .on('error', (err) => {
      console.error('Watcher error:', err);
    });

  return {
    watcher,
    stop: () => watcher.close(),
  };
}

if (require.main === module) {
  startWatcher();
} else {
  startWatcher();
}

module.exports = { startWatcher, loadConfig, addToVmixPlaylist, removeFromVmixPlaylist };