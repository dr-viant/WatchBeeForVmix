import { describe, it, expect, beforeEach, afterEach, test } from 'vitest';
import os from 'os';
import path from 'path';
import { promises as fs } from 'fs';
import nock from 'nock';

// CommonJS modul, så vi bruger require her:
const { startWatcher, loadConfig } = require('../index.js');
// const { loadConfig } = require('../index.js');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

describe('watcher integration med vMix API', () => {
  let dir;
  let watcherHandle;
  let config;
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

  it('kalder vMix ListAdd når en ny .mp4 fil oprettes', async () => {
    const filePath = path.join(dir, 'test.mp4');
    const absolutePath = path.resolve(filePath);
    const encodedPath = encodeURIComponent(absolutePath);
    const inputName = path.basename(path.dirname(absolutePath));

    await fs.writeFile(filePath, 'mockdata');

    nock(baseUrl)
      .get(
        `/api/?Function=ListAdd&Input=${inputName}&Value=${encodedPath}`,
      )
      .reply(200, { ok: true });

    await sleep(500);

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
