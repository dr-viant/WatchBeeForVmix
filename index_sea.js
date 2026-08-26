
const { createRequire } = require('node:module');
require = createRequire(__filename);

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

  const normalized = {};
  for (const [folderPath, playlistName] of Object.entries(playlistMap)) {
    if (typeof playlistName !== 'string' || playlistName.trim() === '') {
      continue;
    }
    const normalizedFolder = normalizeConfigPath(baseDir, folderPath).toLowerCase();
    normalized[normalizedFolder] = playlistName;
  }

  return normalized;
}

function normalizeRuntimeConfig(baseDir, config) {
  const normalizedConfig = { ...config };
  normalizedConfig.folderToWatch = normalizeFolderConfig(baseDir, config.folderToWatch);
  normalizedConfig.playlistMap = normalizePlaylistMap(baseDir, config.playlistMap);
  return normalizedConfig;
}

function getMappedPlaylistName(config, normalizedFolderLower) {
  const directMatch = config.playlistMap?.[normalizedFolderLower];
  if (typeof directMatch === 'string' && directMatch.trim() !== '') {
    return directMatch;
  }

  if (!config.playlistMap || typeof config.playlistMap !== 'object' || Array.isArray(config.playlistMap)) {
    return null;
  }

  for (const [folderPath, playlistName] of Object.entries(config.playlistMap)) {
    if (typeof playlistName !== 'string' || playlistName.trim() === '') {
      continue;
    }
    const normalizedKey = normalizeResolvedPath(folderPath).toLowerCase();
    if (normalizedKey === normalizedFolderLower) {
      return playlistName;
    }
  }

  return null;
}

function getPlaylistName(config, absolutePath) {
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
    const mappedName = getMappedPlaylistName(config, bestMatch.normalizedFolderLower);
    if (typeof mappedName === 'string' && mappedName.trim() !== '') {
      return mappedName;
    }

    return path.basename(bestMatch.normalizedFolder);
  }

  return path.basename(path.dirname(absolutePath));
}

function getExeDir() {
  if (process.pkg) {
    return path.dirname(process.execPath);
  }

  // SEA-style bundles:
  // When running as SEA, process.execPath is the SEA exe,
  // __dirname is not a real “on-disk” code folder.
  if (process.env.NODE_SEA === '1') {
    return path.dirname(process.execPath);
  }

  // Normal node (dev)
  return __dirname;
}

function loadConfig() {
  // const baseDir = getBaseDir();
  const exeDir = getExeDir();
  const configPath = path.join(exeDir, 'config.json');

  let config;
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch {
    // fallback + skriv default config ved siden af exe'en
    config = {
      folderToWatch: path.join(exeDir, 'media'),
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

  config = normalizeRuntimeConfig(exeDir, config);

  return config;
}

function startWatcher(configOverride) {
  const rawConfig =
    configOverride !== undefined && configOverride !== null
      ? configOverride
      : loadConfig();
  const config = normalizeRuntimeConfig(getExeDir(), rawConfig);

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

  const getVmixState = async () => {
    try {
      const response = await axios.get(`${config.vmixUrl}/api`);
      return response.data;
    } catch (error) {
      console.error(`Error getting vMix state: ${error.message}`);
      return null;
    }
  }


  const addToVmixPlaylist = async (filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    if (!config.supportedExtensions.includes(ext)) {
      console.log(`Ignoring ${filePath}, unsupported extension`);
      return;
    }
    try {
      const absolutePath = path.resolve(filePath);
      const encodedPath = encodeURIComponent(absolutePath);
      const inputName = getPlaylistName(config, absolutePath);
      const url = `${config.vmixUrl}/api/?Function=ListAdd&Input=${inputName}&Value=${encodedPath}`;
      await axios.get(url);
      console.log(`Added ${absolutePath} to vMix playlist: ${inputName}`);
    } catch (err) {
      console.error('Error adding to vMix:', err.message);
    }
  };

  // Helper function to remove file from vMix playlist
  const removeFromVmixPlaylist = async (filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    if (!config.supportedExtensions.includes(ext)) {
      console.log(`Ignoring ${filePath}, unsupported extension`);
      return;
    }
    try {
      const absolutePath = path.resolve(filePath);
      const inputName = getPlaylistName(config, absolutePath);
      const xmlState = await getVmixState(); // missing function
      if (!xmlState) return;

      const fileInfo = await findListItems(xmlState, absolutePath);

      if (fileInfo) {
        const url = `${config.vmixUrl}/api/?Function=ListRemove&Input=${inputName}&Value=${fileInfo.index}`;
        await axios.get(url);
        console.log(`Removed ${absolutePath} from vMix playlist "${inputName}" at index ${fileInfo.index}`);
      } else {
        console.log(`File ${absolutePath} not found in any vMix playlist`);
      }
    } catch (error) {
      console.error(`Error removing file from vMix: ${error.message}`);
    }
  }


  watcher
    .on('add', (p) => {
      console.log('File added:', p);
      void addToVmixPlaylist(p);
    })
    .on('change', (p) => {
      console.log('File changed:', p);
      void addToVmixPlaylist(p);
    })
    .on('unlink', (p) => {
      console.log('File removed:', p);
      void removeFromVmixPlaylist(p);
    })
    .on('error', (err) => {
      console.error('Watcher error:', err);
    });

  return {
    watcher,
    stop: () => watcher.close(),
  };
}

// Start kun automatisk, når filen køres direkte (CLI / binary)
if (require.main === module) {
  startWatcher();
} else {
  startWatcher();
}

module.exports = { startWatcher, loadConfig };