import { expect, test } from 'bun:test';
import { Config } from '../../src/config';
await Config.promise('restore');
const { VideoPlayer } = await import('../../src/nico-video-player');

function fixture(time = 0) {
  const media = document.createElement('video');
  media.currentTime = time;
  const commands: string[] = [];
  const player = {
    playbackRate: 1,
    _canPlay: false,
    _video: media,
    _isAspectRatioFixed: false,
    removeClass: () => undefined,
    emit: (event: string, command?: unknown) => {
      if (event === 'command') commands.push(String(command));
    },
  };
  return { player, commands };
}

test('途中再生は有効かつ先頭の初回canPlayだけ保存位置を要求し、手動シークを上書きしない', () => {
  const before = Config.props.enableResume;
  try {
    for (const enabled of [false, true]) {
      Config.props.enableResume = enabled;
      for (const time of [0, 12]) {
        const { player, commands } = fixture(time);
        VideoPlayer.prototype._onCanPlay.call(player);
        VideoPlayer.prototype._onCanPlay.call(player);
        expect(commands).toEqual(enabled && time === 0 ? ['seekToResumePoint'] : []);
      }
    }
  } finally {
    Config.props.enableResume = before;
  }
});
