import { CrossDomainGate } from '../infra/CrossDomainGate';
import { parseThumbInfo } from './parseThumbInfo';
import type { ThumbInfoData } from './parseThumbInfo';
//===BEGIN===
const ThumbInfoLoader = (() => {
  const BASE_URL = 'https://ext.nicovideo.jp/';
  const MESSAGE_ORIGIN = 'https://ext.nicovideo.jp/';
  let gate: CrossDomainGate | null = null;

  const initGate = () => {
    if (gate) {
      return gate;
    }
    gate = new CrossDomainGate({
      baseUrl: BASE_URL,
      origin: MESSAGE_ORIGIN,
      type: 'thumbInfo',
    });
  };

  const load = async (watchId: string): Promise<ThumbInfoData> => {
    initGate();

    const fetchOptions: RequestInit & { _format?: string; expireTime?: number } = {
      _format: 'text',
      expireTime: 24 * 60 * 60 * 1000,
    };
    const fetched: unknown = await gate!
      .fetch(`${BASE_URL}api/getthumbinfo/${watchId}`, fetchOptions)
      .catch((e: Error) => {
        return { status: 'fail', message: e.message || `gate.fetch('${watchId}') failed` };
      });

    const thumbInfo = fetched as ThumbInfoData;
    if (thumbInfo.status !== 'ok') {
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- 旧実装はthumbInfoオブジェクトでrejectする契約のため維持する
      return Promise.reject(thumbInfo);
    }
    return thumbInfo;
  };

  return { initGate, load };
})();

//===END===

export { ThumbInfoLoader, parseThumbInfo };
