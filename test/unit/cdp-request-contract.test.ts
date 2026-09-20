import { describe, expect, it } from 'bun:test';
import { JSDOM } from 'jsdom';
import { isBlockedUrl } from '../fixtures/cdp/network-policy';
import { installOfflineScene } from '../fixtures/cdp/offline';
import { matchFixture, normalizeUrl, type CdpRequestFixture, type CdpScene } from '../fixtures/cdp/scene';

const url = 'https://nvapi.nicovideo.jp/v1/watch/sm9/tags';
function sceneFor(request: CdpRequestFixture): CdpScene {
  return {
    format: 'futatsume-cdp-scene/v1',
    name: 'request-contract',
    capturedAt: '2026-09-20T00:00:00Z',
    targetUrl: 'https://www.nicovideo.jp/watch/sm9',
    network: [
      { request, response: { status: 200, fromFixture: true, bodyText: '{"ok":true}', mimeType: 'application/json' } },
    ],
  };
}
const jsonRequest = (): CdpRequestFixture => ({
  method: 'POST',
  url,
  headers: { 'Content-Type': 'application/json' },
  postData: '{"videoId":"sm9","tag":"Test","time":10,"commands":["red","big"]}',
});

describe('要求契約の厳密照合', () => {
  it('ホストだけ大文字小文字を正規化し、パス・値・意味クエリ・ポートを保持する', () => {
    const scene = sceneFor({ method: 'GET', url: `${url}?page=1&t=10&tag=Test` });
    expect(matchFixture(scene, 'get', `${url.replace('nvapi', 'NVAPI')}?tag=Test&t=10&page=1#ignored`)).not.toBeNull();
    for (const candidate of [
      `${url}?page=2&t=10&tag=Test`,
      `${url}?page=1&t=11&tag=Test`,
      `${url}?page=1&t=10&tag=test`,
      `${url}?page=1&tag=Test`,
      `${url}?page=1&t=10&tag=Test&extra=1`,
      `${url.replace('sm9', 'SM9')}?page=1&t=10&tag=Test`,
      `${url.replace('https:', 'http:')}?page=1&t=10&tag=Test`,
      `${url.replace('.jp/', '.jp:8443/')}?page=1&t=10&tag=Test`,
    ])
      expect(matchFixture(scene, 'GET', candidate)).toBeNull();
    expect(matchFixture(scene, 'POST', `${url}?page=1&t=10&tag=Test`)).toBeNull();
  });

  it('キャッシュバスターは個別指定し、重複クエリ値の順序を勝手に変えない', () => {
    const scene = sceneFor({ method: 'GET', url: `${url}?_=old&t=5`, ignoreQueryParameters: ['_'] });
    expect(matchFixture(scene, 'GET', `${url}?t=5&_=new`)).not.toBeNull();
    expect(matchFixture(scene, 'GET', `${url}?t=6&_=new`)).toBeNull();
    expect(normalizeUrl(`${url}?tag=A&tag=B`)).not.toBe(normalizeUrl(`${url}?tag=B&tag=A`));
  });

  it('JSONのキー順・空白だけを吸収し、ID・本文・時刻・型・配列順・欠落を区別する', () => {
    const scene = sceneFor(jsonRequest());
    expect(
      matchFixture(scene, 'POST', url, {
        postData: '{ "time":10,"tag":"Test","commands":["red","big"],"videoId":"sm9"}',
      })
    ).not.toBeNull();
    for (const postData of [
      jsonRequest().postData!.replace('sm9', 'sm10'),
      jsonRequest().postData!.replace('Test', 'test'),
      jsonRequest().postData!.replace('10', '11'),
      jsonRequest().postData!.replace('10', '"10"'),
      jsonRequest().postData!.replace('"red","big"', '"big","red"'),
      '{}',
      '{',
      '',
    ])
      expect(matchFixture(scene, 'POST', url, { postData })).toBeNull();
    expect(matchFixture(scene, 'POST', url)).toBeNull();
    expect(
      matchFixture(scene, 'POST', url, { postData: jsonRequest().postData, headers: { 'content-type': 'text/plain' } })
    ).toBeNull();
  });

  it('フォームのエンコードとキー順を正規化し、値・重複値を区別する', () => {
    const scene = sceneFor({
      method: 'POST',
      url,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      postData: 'tag=%E6%97%A5%E6%9C%AC+%E8%AA%9E&id=sm9',
    });
    expect(matchFixture(scene, 'POST', url, { postData: 'id=sm9&tag=日本%20語' })).not.toBeNull();
    expect(matchFixture(scene, 'POST', url, { postData: 'id=sm10&tag=日本%20語' })).toBeNull();
    expect(matchFixture(scene, 'POST', url, { postData: 'id=sm9&id=sm9&tag=日本%20語' })).toBeNull();
  });

  it('未記録本文・広すぎるパターンでも異なる要求を成功扱いしない', () => {
    const scene = sceneFor({ method: 'POST', url });
    expect(matchFixture(scene, 'POST', url)).not.toBeNull();
    expect(matchFixture(scene, 'POST', url, { postData: '{"tag":"write"}' })).toBeNull();
    const patternScene = sceneFor({
      method: 'GET',
      url: `${url}?page=1`,
      urlPattern: 'https://nvapi\\.nicovideo\\.jp/.*',
    });
    expect(matchFixture(patternScene, 'GET', `${url}?page=1`)).not.toBeNull();
    expect(matchFixture(patternScene, 'GET', `${url}?page=2`)).toBeNull();
    expect(matchFixture(patternScene, 'GET', `${url.replace('sm9', 'sm10')}?page=1`)).toBeNull();
    expect(matchFixture(patternScene, 'GET', `https://evil.test/${url}?page=1`)).toBeNull();
    patternScene.network[0]!.request.urlPattern = '[';
    expect(matchFixture(patternScene, 'GET', `${url}?page=1`)).toBeNull();
  });

  it('許可ドメイン名を含む別ホスト、認証URL、非HTTPは遮断する', () => {
    for (const value of [
      'https://nvapi.nicovideo.jp.evil.test/v1/watch/sm9',
      'https://evildmc.nico/media',
      'https://domand.evil.test/media',
      'https://evilsmilevideo.jp/media',
      'ftp://nvapi.nicovideo.jp/file',
      'https://user:password@nvapi.nicovideo.jp/file',
      'https://www.nicovideo.jp/watch/sm9?from=test&edit=1',
    ])
      expect(isBlockedUrl(value)).toBe(true);
    expect(isBlockedUrl('https://abc.dmc.nico/media')).toBe(false);
  });
});

describe('Bunの通信差し替え', () => {
  it('Requestのmethod/body/headerとURL入力を使い、意味の異なるPOSTを拒否する', async () => {
    const session = installOfflineScene(sceneFor(jsonRequest()));
    try {
      const response = await fetch(
        new Request(url, {
          method: 'POST',
          body: jsonRequest().postData,
          headers: { 'content-type': 'application/json' },
        })
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true });
      expect(
        await fetch(new URL(url), {
          method: 'POST',
          body: '{}',
          headers: { 'content-type': 'application/json' },
        }).catch((error: Error) => error.message)
      ).toContain('no fixture');
      expect(session.fetchLog.map((entry) => entry.fromFixture)).toEqual([true, false]);
    } finally {
      session.restore();
    }
  });

  it('バイナリ応答をUTF-8で破壊せず、mimeTypeも渡す', async () => {
    const scene = sceneFor({ method: 'GET', url });
    scene.network[0]!.response = {
      status: 200,
      fromFixture: true,
      mimeType: 'video/mp2t',
      bodyBase64: Buffer.from([0, 255, 128, 195, 40, 71]).toString('base64'),
    };
    const session = installOfflineScene(scene);
    try {
      const response = await fetch(new URL(url));
      expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([0, 255, 128, 195, 40, 71]);
      expect(response.headers.get('content-type')).toBe('video/mp2t');
    } finally {
      session.restore();
    }
  });

  it('HEAD・204の空応答とabortに対応し、restoreを繰り返しても元に戻る', async () => {
    const originalFetch = globalThis.fetch;
    const scene = sceneFor({ method: 'HEAD', url });
    scene.network[0]!.response.status = 204;
    const session = installOfflineScene(scene);
    try {
      const response = await fetch(url, { method: 'HEAD' });
      expect(response.status).toBe(204);
      expect(await response.text()).toBe('');
      const abort = new AbortController();
      abort.abort();
      expect(await fetch(url, { signal: abort.signal }).catch((error: Error) => error.message)).toContain('aborted');
      expect(session.fetchLog).toHaveLength(1);
    } finally {
      session.restore();
      session.restore();
    }
    expect(globalThis.fetch).toBe(originalFetch);
  });

  it('XHRのJSON本文・バイナリ・ヘッダー・再open・abort・復元を実装する', async () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'XMLHttpRequest');
    const dom = new JSDOM('', { url: 'https://www.nicovideo.jp/watch/sm9' });
    Object.defineProperty(globalThis, 'XMLHttpRequest', {
      configurable: true,
      writable: true,
      value: dom.window.XMLHttpRequest,
    });
    const scene = sceneFor(jsonRequest());
    scene.network.push({
      request: { method: 'GET', url: `${url}/binary` },
      response: { status: 200, fromFixture: true, mimeType: 'video/mp2t', bodyBase64: 'AP+A' },
    });
    const session = installOfflineScene(scene);
    try {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', url);
      xhr.setRequestHeader('content-type', 'application/json');
      const loaded = new Promise<void>((resolve) => xhr.addEventListener('load', () => resolve(), { once: true }));
      xhr.send(jsonRequest().postData);
      await loaded;
      expect(xhr.status).toBe(200);
      expect(xhr.responseText).toBe('{"ok":true}');
      expect(xhr.getResponseHeader('Content-Type')).toBe('application/json');
      expect(xhr.getAllResponseHeaders()).toContain('x-futatsume-fixture: 1');
      xhr.open('GET', `${url}/binary`);
      xhr.responseType = 'arraybuffer';
      const binaryLoaded = new Promise<void>((resolve) =>
        xhr.addEventListener('load', () => resolve(), { once: true })
      );
      xhr.send();
      await binaryLoaded;
      expect([...new Uint8Array(xhr.response as ArrayBuffer)]).toEqual([0, 255, 128]);
      expect(() => xhr.responseText).toThrow();
      xhr.open('POST', url);
      xhr.setRequestHeader('content-type', 'application/json');
      expect(() => xhr.send('{}')).toThrow('no fixture');
      xhr.open('GET', `${url}/binary`);
      let loads = 0;
      let aborts = 0;
      xhr.addEventListener('load', () => loads++);
      xhr.addEventListener('abort', () => aborts++);
      xhr.send();
      xhr.abort();
      await Promise.resolve();
      expect(loads).toBe(0);
      expect(aborts).toBe(1);
      expect(xhr.readyState).toBe(0);
      expect(xhr.status).toBe(0);
      expect(session.fetchLog.map((entry) => entry.fromFixture)).toEqual([true, true, false, true]);
      session.restore();
      expect(globalThis.XMLHttpRequest).toBe(dom.window.XMLHttpRequest);
    } finally {
      session.restore();
      dom.window.close();
      if (original) Object.defineProperty(globalThis, 'XMLHttpRequest', original);
      else Reflect.deleteProperty(globalThis, 'XMLHttpRequest');
    }
  });
});
