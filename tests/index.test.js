import { describe, it, expect, beforeEach, afterEach, test } from 'vitest';
import os from 'os';
import path from 'path';
import { promises as fs } from 'fs';
import nock from 'nock';

// CommonJS modul, så vi bruger require her:
const { startWatcher, loadConfig } = require('../index.js');
// const { loadConfig } = require('../index.js');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function buildVmixState(playlistName, entries) {
  const items = entries
    .map((entry) => `<item>${entry}</item>`)
    .join('');

  return `<?xml version="1.0" encoding="utf-8"?>
<vmix>
  <inputs>
    <input key="1" number="1" type="VideoList" title="${playlistName}">
      <list>${items}</list>
    </input>
  </inputs>
</vmix>`;
}

describe('watcher integration med vMix API', () => {
  let dir;
  let watcherHandle;
  const baseUrl = 'http://localhost:8088';

  beforeEach(async () => {
    // Opret en isoleret temp-mappe til denne test
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'watcher-test-'));
    const configPath = path.join(dir, 'config.json');

    // Blokér rigtige netværkskald – alt skal via nock
    nock.cleanAll();
    nock.disableNetConnect();

    const config = {
      folderToWatch: dir,
      vmixUrl: baseUrl,
      supportedExtensions: ['.mp4', '.mov', '.wmv', '.avi', '.mpg', '.mpeg'],
    };

    await fs.writeFile(configPath, JSON.stringify(config));
  });

  afterEach(async () => {
    // Stop watcher
    await watcherHandle?.stop?.();

    // Ryd temp-mappe
    await fs.rm(dir, { recursive: true, force: true });

    // Verificér at alle HTTP-mocks blev brugt
    expect(nock.isDone()).toBe(true);

    nock.cleanAll();
    nock.enableNetConnect();
  });

  it('kalder vMix ListAdd når en ny .mp4 fil oprettes', async () => {
    const filePath = path.join(dir, 'test.mp4');
    const absolutePath = path.resolve(filePath);
    const encodedPath = encodeURIComponent(absolutePath);
    // Playlist name comes from the watched folder, not the file's parent dir
    const inputName = path.basename(dir);

    nock(baseUrl)
      .get('/api')
      .reply(200, buildVmixState(inputName, []));

    const listAddScope = nock(baseUrl)
      .get(
        `/api/?Function=ListAdd&Input=${inputName}&Value=${encodedPath}`,
      )
      .reply(200, { ok: true });

    watcherHandle = startWatcher({
      folderToWatch: dir,
      vmixUrl: baseUrl,
      supportedExtensions: ['.mp4', '.mov', '.wmv', '.avi', '.mpg', '.mpeg'],
    });

    await fs.writeFile(filePath, 'mockdata');

    await sleep(3000);
    expect(listAddScope.isDone()).toBe(true);
  });

  it('springer startup add over når fil allerede findes i mål-playlisten', async () => {
    const existingPath = path.resolve(path.join(dir, 'existing.mp4'));
    const inputName = path.basename(dir);

    nock(baseUrl)
      .get('/api')
      .reply(200, buildVmixState(inputName, [encodeURIComponent(existingPath)]));

    let listAddCalls = 0;
    nock(baseUrl)
      .get((uri) => uri.includes('Function=ListAdd'))
      .optionally()
      .reply(() => {
        listAddCalls += 1;
        return [200, { ok: true }];
      });

    watcherHandle = startWatcher({
      folderToWatch: dir,
      vmixUrl: baseUrl,
      supportedExtensions: ['.mp4', '.mov', '.wmv', '.avi', '.mpg', '.mpeg'],
    });

    await fs.writeFile(existingPath, 'mockdata');
    await sleep(3000);

    expect(listAddCalls).toBe(0);
  });

  it('springer change over når fil allerede er indekseret i playlisten', async () => {
    const existingPath = path.resolve(path.join(dir, 'changed.mp4'));
    const inputName = path.basename(dir);

    await fs.writeFile(existingPath, 'mockdata-before-start');

    nock(baseUrl)
      .get('/api')
      .reply(200, buildVmixState(inputName, [encodeURIComponent(existingPath)]));

    let listAddCalls = 0;
    nock(baseUrl)
      .get((uri) => uri.includes('Function=ListAdd'))
      .optionally()
      .reply(() => {
        listAddCalls += 1;
        return [200, { ok: true }];
      });

    watcherHandle = startWatcher({
      folderToWatch: dir,
      vmixUrl: baseUrl,
      supportedExtensions: ['.mp4', '.mov', '.wmv', '.avi', '.mpg', '.mpeg'],
    });

    await sleep(3000);
    await fs.writeFile(existingPath, 'mockdata-after-change');
    await sleep(3000);

    expect(listAddCalls).toBe(0);
  }, 15000);

  it('matcher encoded vMix sti mod lokal filsti under startup dedupe', async () => {
    const existingPath = path.resolve(path.join(dir, 'encoded path clip.mp4'));
    const inputName = path.basename(dir);

    nock(baseUrl)
      .get('/api')
      .reply(200, buildVmixState(inputName, [encodeURIComponent(existingPath)]));

    let listAddCalls = 0;
    nock(baseUrl)
      .get((uri) => uri.includes('Function=ListAdd'))
      .optionally()
      .reply(() => {
        listAddCalls += 1;
        return [200, { ok: true }];
      });

    watcherHandle = startWatcher({
      folderToWatch: dir,
      vmixUrl: baseUrl,
      supportedExtensions: ['.mp4', '.mov', '.wmv', '.avi', '.mpg', '.mpeg'],
    });

    await fs.writeFile(existingPath, 'mockdata');
    await sleep(3000);

    expect(listAddCalls).toBe(0);
  });
});

describe('watcher multi-folder support', () => {
  let dir1;
  let dir2;
  let watcherHandle;
  const baseUrl = 'http://localhost:8088';

  beforeEach(async () => {
    dir1 = await fs.mkdtemp(path.join(os.tmpdir(), 'watcher-folder1-'));
    dir2 = await fs.mkdtemp(path.join(os.tmpdir(), 'watcher-folder2-'));

    nock.cleanAll();
    nock.disableNetConnect();

    const config = {
      folderToWatch: [dir1, dir2],
      vmixUrl: baseUrl,
      supportedExtensions: ['.mp4'],
    };

    nock(baseUrl)
      .get('/api')
      .reply(200, buildVmixState(path.basename(dir1), []));

    watcherHandle = startWatcher(config);
  });

  afterEach(async () => {
    await watcherHandle?.stop?.();
    await fs.rm(dir1, { recursive: true, force: true });
    await fs.rm(dir2, { recursive: true, force: true });
    expect(nock.isDone()).toBe(true);
    nock.cleanAll();
    nock.enableNetConnect();
  });

  it('router filer til den korrekte playlist baseret på konfigureret mappe', async () => {
    const file1 = path.join(dir1, 'clip1.mp4');
    const file2 = path.join(dir2, 'clip2.mp4');

    nock(baseUrl)
      .get(`/api/?Function=ListAdd&Input=${path.basename(dir1)}&Value=${encodeURIComponent(path.resolve(file1))}`)
      .reply(200, { ok: true });

    nock(baseUrl)
      .get(`/api/?Function=ListAdd&Input=${path.basename(dir2)}&Value=${encodeURIComponent(path.resolve(file2))}`)
      .reply(200, { ok: true });

    await fs.writeFile(file1, 'mockdata');
    await fs.writeFile(file2, 'mockdata');

    await sleep(3000);
  });

  it('ignorerer filer med ikke-understøttet extension i multi-folder setup', async () => {
    const txtFile = path.join(dir1, 'ignore.txt');
    const xmlFile = path.join(dir2, 'ignore.xml');

    // No nock mocks registered — any HTTP call would throw
    await fs.writeFile(txtFile, 'mockdata');
    await fs.writeFile(xmlFile, 'mockdata');

    await sleep(3000);
  });
});

describe('Testing file handler logic', () => {
  let dir;
  let watcherHandle;
  let config;
  const baseUrl = 'http://localhost:8088';

  beforeEach(async () => {
    // Opret en isoleret temp-mappe til denne test
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'watcher-test2-'));
    const configPath = path.join(dir, 'config.json');

    // Blokér rigtige netværkskald – alt skal via nock
    nock.cleanAll();
    nock.disableNetConnect();

    const config = {
      folderToWatch: dir,
      vmixUrl: baseUrl,
      supportedExtensions: ['.mp4'],
    };

    await fs.writeFile(configPath, JSON.stringify(config));

    nock(baseUrl)
      .get('/api')
      .reply(200, buildVmixState(path.basename(dir), []));

    watcherHandle = startWatcher(config);
  });

  afterEach(async () => {
    // Stop watcher
    await watcherHandle?.stop?.();

    // Ryd temp-mappe
    await fs.rm(dir, { recursive: true, force: true });

    // Verificér at alle HTTP-mocks blev brugt
    expect(nock.isDone()).toBe(true);

    nock.cleanAll();
    nock.enableNetConnect();
  });

  test('Expect to return false when extension is not supported', async () => {
    const filePath = path.join(dir, 'test.not');
    // await fs.readFile(filePath, 'utf8');

    const ext = path.extname(filePath).toLowerCase();
    expect(loadConfig().supportedExtensions.includes(ext)).toBe(false)

  });

  test('Expect to return true when extension is supported', async () => {
    const filePath = path.join(dir, 'test.mp4');
    // await fs.readFile(filePath, 'utf8');

    const ext = path.extname(filePath).toLowerCase();
    expect(loadConfig().supportedExtensions.includes(ext)).toBe(true)
  });

});
