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
    const path_input1 = path.basename(dir2); // playlist name = configured folder name
    const expectedUrl1 =
      `${baseUrl}/api/?Function=ListAdd` +
      `&Input=${path_input1}&Value=${encodedPath1}`;

    await addToVmixPlaylist(config, mp4_file);

    const path2 = path.resolve(mp4_file_2);
    const encodedPath2 = encodeURIComponent(path2);
    const path_input2 = path.basename(dir3); // playlist name = configured folder name
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

  it('bruger custom playlist-navn via playlistMap', async () => {
    const getSpy = vi
      .spyOn(axios, 'get')
      .mockResolvedValue({ data: { ok: true } });

    const configWithMap = {
      ...config,
      playlistMap: {
        [dir2]: 'StudioA',
        [dir3]: 'StudioB',
      },
    };

    const expectedUrl1 =
      `${baseUrl}/api/?Function=ListAdd` +
      `&Input=StudioA&Value=${encodeURIComponent(path.resolve(mp4_file))}`;
    const expectedUrl2 =
      `${baseUrl}/api/?Function=ListAdd` +
      `&Input=StudioB&Value=${encodeURIComponent(path.resolve(mp4_file_2))}`;

    await addToVmixPlaylist(configWithMap, mp4_file);
    await addToVmixPlaylist(configWithMap, mp4_file_2);

    expect(getSpy).toHaveBeenCalledTimes(2);
    expect(getSpy).toHaveBeenCalledWith(expectedUrl1);
    expect(getSpy).toHaveBeenCalledWith(expectedUrl2);
  });

  it('vælger mest specifikke mappe-match ved overlap', async () => {
    const getSpy = vi
      .spyOn(axios, 'get')
      .mockResolvedValue({ data: { ok: true } });

    const overlapConfig = {
      ...config,
      folderToWatch: [dir, dir2],
      playlistMap: {
        [dir]: 'ParentList',
        [dir2]: 'ChildList',
      },
    };

    const expectedUrl =
      `${baseUrl}/api/?Function=ListAdd` +
      `&Input=ChildList&Value=${encodeURIComponent(path.resolve(mp4_file))}`;

    await addToVmixPlaylist(overlapConfig, mp4_file);

    expect(getSpy).toHaveBeenCalledTimes(1);
    expect(getSpy).toHaveBeenCalledWith(expectedUrl);
  });

  it('tillader to mapper at pege på samme playlist', async () => {
    const getSpy = vi
      .spyOn(axios, 'get')
      .mockResolvedValue({ data: { ok: true } });

    const sharedConfig = {
      ...config,
      playlistMap: {
        [dir2]: 'SharedPlaylist',
        [dir3]: 'SharedPlaylist',
      },
    };

    const expectedUrl1 =
      `${baseUrl}/api/?Function=ListAdd` +
      `&Input=SharedPlaylist&Value=${encodeURIComponent(path.resolve(mp4_file))}`;
    const expectedUrl2 =
      `${baseUrl}/api/?Function=ListAdd` +
      `&Input=SharedPlaylist&Value=${encodeURIComponent(path.resolve(mp4_file_2))}`;

    await addToVmixPlaylist(sharedConfig, mp4_file);
    await addToVmixPlaylist(sharedConfig, mp4_file_2);

    expect(getSpy).toHaveBeenCalledTimes(2);
    expect(getSpy).toHaveBeenCalledWith(expectedUrl1);
    expect(getSpy).toHaveBeenCalledWith(expectedUrl2);
  });

  it('tillader en mappe at pege på to playlists', async () => {
    const getSpy = vi
      .spyOn(axios, 'get')
      .mockResolvedValue({ data: { ok: true } });

    const multiPlaylistConfig = {
      ...config,
      folderToWatch: [dir2],
      playlistMap: {
        [dir2]: ['PrimaryPlaylist', 'BackupPlaylist'],
      },
    };

    const expectedUrl1 =
      `${baseUrl}/api/?Function=ListAdd` +
      `&Input=PrimaryPlaylist&Value=${encodeURIComponent(path.resolve(mp4_file))}`;
    const expectedUrl2 =
      `${baseUrl}/api/?Function=ListAdd` +
      `&Input=BackupPlaylist&Value=${encodeURIComponent(path.resolve(mp4_file))}`;

    await addToVmixPlaylist(multiPlaylistConfig, mp4_file);

    expect(getSpy).toHaveBeenCalledTimes(2);
    expect(getSpy).toHaveBeenCalledWith(expectedUrl1);
    expect(getSpy).toHaveBeenCalledWith(expectedUrl2);
  });

  it('falder tilbage til path-navn når fil ikke matcher folderToWatch', async () => {
    const getSpy = vi
      .spyOn(axios, 'get')
      .mockResolvedValue({ data: { ok: true } });

    const outsideFile = path.join(os.tmpdir(), `watcher-outside-${Date.now()}.mp4`);
    const expectedInput = path.basename(path.dirname(path.resolve(outsideFile)));
    const expectedUrl =
      `${baseUrl}/api/?Function=ListAdd` +
      `&Input=${expectedInput}&Value=${encodeURIComponent(path.resolve(outsideFile))}`;

    await addToVmixPlaylist(config, outsideFile);

    expect(getSpy).toHaveBeenCalledTimes(1);
    expect(getSpy).toHaveBeenCalledWith(expectedUrl);
  });
});