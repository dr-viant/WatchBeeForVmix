// addToVmixPlaylist.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'path';

const axios = require('axios');
const { addToVmixPlaylist } = require('../index.js');

const baseUrl = 'http://localhost:8088';

const config = {
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
    const filePath = '/workspaces/WatchBeeForVmix/media/test.mp4';

    const absolutePath = path.resolve(filePath);
    const encodedPath = encodeURIComponent(absolutePath);
    const inputName = path.basename(path.dirname(absolutePath));
    const expectedUrl =
      `${baseUrl}/api/?Function=ListAdd` +
      `&Input=${inputName}&Value=${encodedPath}`;

    const getSpy = vi
      .spyOn(axios, 'get')
      .mockResolvedValue({ data: { ok: true } });

    await addToVmixPlaylist(config, filePath);

    expect(getSpy).toHaveBeenCalledTimes(1);
    expect(getSpy).toHaveBeenCalledWith(expectedUrl);
  });

  it('ignorerer unsupported extension (ingen axios-kald)', async () => {
    const filePath = '/workspaces/WatchBeeForVmix/media/test.txt';

    const getSpy = vi
      .spyOn(axios, 'get')
      .mockResolvedValue({ data: { ok: true } });

    await addToVmixPlaylist(config, filePath);

    expect(getSpy).not.toHaveBeenCalled();
  });
});