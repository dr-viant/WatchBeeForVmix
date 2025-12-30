
const { createRequire } = require('node:module');
require = createRequire(__filename);

const chokidar = require('chokidar');
const axios = require('axios');
const path = require('path');
const fs = require('fs');

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

  // Sørg for at folderToWatch er absolut
  if (!path.isAbsolute(config.folderToWatch)) {
    config.folderToWatch = path.join(exeDir, config.folderToWatch);
  }

  return config;
}

function startWatcher(configOverride) {
  const config =
    configOverride !== undefined && configOverride !== null
      ? configOverride
      : loadConfig();

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
      const inputName = path.basename(path.dirname(absolutePath));
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
      const inputName = path.basename(path.dirname(absolutePath));
      const xmlState = await getVmixState(); // missing function
      if (!xmlState) return;

      const fileInfo = findListItems(xmlState, absolutePath);

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