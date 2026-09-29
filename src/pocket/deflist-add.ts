import { MylistApiLoader } from '../shared/external-api';
import type { FutatsumeLike } from './types';

export function addPocketWatchLater(watchId: string, detect: () => Promise<unknown>): Promise<unknown> {
  if (location.host === 'www.nicovideo.jp') return MylistApiLoader.addDeflistItem(watchId, '');
  return detect().then((value) => {
    if (!value) throw new Error('とりあえずマイリストへ接続できませんでした。');
    return (value as FutatsumeLike).external.deflistAdd({ watchId, description: '' });
  });
}
