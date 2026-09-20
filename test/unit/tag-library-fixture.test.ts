import { expect, test } from 'bun:test';
import { createLibraryRoutes } from '../../scripts/offline-library';
import base from '../fixtures/functionality/watch-response.json';

test('P0/P4 タグフェイクは本文・権限・動画を照合し、成功した変更だけ保持する', async () => {
  const library = createLibraryRoutes();
  const request = {
    url: 'https://nvapi.nicovideo.jp/v2/videos/sm9/tags?tag=test',
    method: 'POST',
    headers: { 'X-Tag-Edit-Key': base.data.response.tag.edit.editKey },
  };
  expect((await library.reply({ ...request, headers: {} }))?.status).toBe(403);
  expect(library.tags.get('sm9')!.some((tag) => tag.name === 'test')).toBe(false);
  expect((await library.reply(request))?.status).toBe(200);
  expect(library.tags.get('sm9')!.filter((tag) => tag.name === 'test')).toHaveLength(1);
  expect(library.tags.get('sm100')!.some((tag) => tag.name === 'test')).toBe(false);
  expect((await library.reply(request))?.status).toBe(409);
  expect((await library.reply({ ...request, method: 'DELETE' }))?.status).toBe(200);
  expect(library.tags.get('sm9')!.some((tag) => tag.name === 'test')).toBe(false);
  expect(library.writes).toHaveLength(2);
  expect(await library.reply({ ...request, url: request.url + '&unexpected=1' })).toBeNull();
  expect(await library.reply({ ...request, url: request.url.replace('nvapi.nicovideo.jp', 'example.com') })).toBeNull();
});
test('P0/P3 フェイクの後で見るは1件だけ追加し、拒否時に保存結果を変えない', async () => {
  const library = createLibraryRoutes();
  const request = {
    url: 'https://nvapi.nicovideo.jp/v1/users/me/watch-later',
    method: 'POST',
    postData: 'watchId=sm100&memo=test',
  };
  expect((await library.reply(request))?.status).toBe(201);
  expect(library.watchLater.get('sm100')).toBe('test');
  expect((await library.reply(request))?.status).toBe(409);
  expect(library.watchLater.size).toBe(1);
  expect(await library.reply({ ...request, postData: 'watchId=sm999&memo=test' })).toBeNull();
  expect(await library.reply({ ...request, postData: 'watchId=sm100' })).toBeNull();
  expect(library.writes).toHaveLength(1);
  const get = await library.reply({
    url: request.url + '?sortKey=addedAt&sortOrder=desc&pageSize=100&page=1',
    method: 'GET',
  });
  expect(get?.status).toBe(200);
  expect(String(get?.body)).toContain('sm100');
});
test('P0/P3 関連APIはbase64レシピの動画IDと種類を区別する', async () => {
  const library = createLibraryRoutes();
  const request = (id: string) => ({
    method: 'GET',
    url:
      'https://nvapi.nicovideo.jp/v1/recommend?' +
      new URLSearchParams({
        recipe: Buffer.from(JSON.stringify({ id: 'video_playlist_common', videoId: id })).toString('base64'),
        site: 'nicovideo',
        _frontendId: '6',
        _frontendVersion: '0',
      }).toString(),
  });
  expect((await library.reply(request('sm9')))?.status).toBe(200);
  expect(await library.reply(request('sm999'))).toBeNull();
});
