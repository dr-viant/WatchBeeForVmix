// addToVmixPlaylist.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'path';
import { promises as fs } from 'fs';
import os from 'os';

const axios = require('axios');
const { addToVmixPlaylist } = require('../index.js');

const baseUrl = 'http://localhost:8088';

let dir = await fs.mkdtemp(path.join(os.tmpdir(), 'watcher-base'));
let dir2 = await fs.mkdtemp(path.join(dir, 'watcher-server1'));
let dir3 = await fs.mkdtemp(path.join(dir, 'watcher-server2'));

const mp4_file = path.join(dir2, 'test.mp4');
const mp4_file_2 = path.join(dir3, 'test.mp4');
const txt_file = path.join(dir2, 'test.txt');
const sql_file = path.join(dir3, 'test.sql');

const config = {
  folderToWatch: [dir2, dir3],
  vmixUrl: baseUrl,
  supportedExtensions: [
    '.mp4',
    '.mov',
    '.wmv',
    '.avi',
    '.mpg',
    '.mpeg',
    '.mxf',
    '.mts',
  ],
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('addToVmixPlaylist', () => {
  it('kalder axios.get med korrekt URL for gyldig .mp4', async () => {
    const getSpy = vi
      .spyOn(axios, 'get')
      .mockResolvedValue({ data: { ok: true } });
    // const spy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const path1 = path.resolve(mp4_file);
    const encodedPath1 = encodeURIComponent(path1);
    const path_input1 = path.basename(path.dirname(path1));
    const expectedUrl1 =
      `${baseUrl}/api/?Function=ListAdd` +
      `&Input=${path_input1}&Value=${encodedPath1}`;

    await addToVmixPlaylist(config, mp4_file);

    const path2 = path.resolve(mp4_file_2);
    const encodedPath2 = encodeURIComponent(path2);
    const path_input2 = path.basename(path.dirname(path2));
    const expectedUrl2 =
      `${baseUrl}/api/?Function=ListAdd` +
      `&Input=${path_input2}&Value=${encodedPath2}`;

    await addToVmixPlaylist(config, mp4_file_2);
    // console.log(spy.mock.calls);

    expect(getSpy).toHaveBeenCalledTimes(2);
    expect(getSpy).toHaveBeenCalledWith(expectedUrl1);
    expect(getSpy).toHaveBeenCalledWith(expectedUrl2);
  });

  it('ignorerer unsupported extension (ingen axios-kald)', async () => {

    const getSpy = vi
      .spyOn(axios, 'get')
      .mockResolvedValue({ data: { ok: true } });

    await addToVmixPlaylist(config, txt_file);
    await addToVmixPlaylist(config, sql_file);

    expect(getSpy).not.toHaveBeenCalled();
  });
});