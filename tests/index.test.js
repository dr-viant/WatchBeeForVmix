import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import os from 'os';
import path from 'path';
import fs from 'fs/promises';
import nock from 'nock';

// CommonJS modul, så vi bruger require her:
const { startWatcher } = require('../index.js');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

describe('watcher integration med vMix API', () => {
  let dir;
  let watcherHandle;

  const baseUrl = 'http://localhost:8088';

  beforeEach(async () => {
    // Opret en isoleret temp-mappe til denne test
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'watcher-test-'));

    // Blokér rigtige netværkskald – alt skal via nock
    nock.cleanAll();
    nock.disableNetConnect();

    const config = {
      folderToWatch: dir,
      vmixUrl: baseUrl,
      supportedExtensions: ['.mp4', '.mov', '.wmv', '.avi', '.mpg', '.mpeg'],
    };

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
    const inputName = path.basename(absolutePath);

    // Forvent, at din kode laver et GET til dette endpoint
    nock(baseUrl)
      .get(
        `/api/?Function=ListAdd&Input=${inputName}&Value=${encodedPath}`,
      )
      .reply(200, { ok: true });

    // Act: Opret filen
    await fs.writeFile(filePath, 'mockdata');

    // Giv chokidar/axios lidt tid til at reagere
    await sleep(500);

    // Selve verifikationen sker i afterEach via nock.isDone()
  });
});
