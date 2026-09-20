import { expect, test } from 'bun:test';
import { Config } from '../../src/config';
await Config.promise('restore');
const { VideoPlayer } = await import('../../src/nico-video-player');

function fixture(time = 0, youtube = false) {
  const media = document.createElement('video');
  media.currentTime = time;
  const commands: string[] = [];
  let qualitySelections = 0;
  const player = {
    playbackRate: 1,
    _canPlay: false,
    _video: media,
    _isYouTube: youtube,
    _isAspectRatioFixed: false,
    _videoYouTube: { selectBestQuality: () => qualitySelections++ },
    removeClass: () => undefined,
    emit: (event: string, command?: unknown) => {
      if (event === 'command') commands.push(String(command));
    },
  };
  return { player, commands, selections: () => qualitySelections };
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

test('YouTube最高画質設定はYouTubeの初回だけ反映し、通常映像とOFFには要求しない', () => {
  const before = Config.props.bestFutatsumeTube;
  try {
    for (const enabled of [false, true]) {
      Config.props.bestFutatsumeTube = enabled;
      for (const youtube of [false, true]) {
        const { player, selections } = fixture(0, youtube);
        VideoPlayer.prototype._onCanPlay.call(player);
        VideoPlayer.prototype._onCanPlay.call(player);
        expect(selections()).toBe(enabled && youtube ? 1 : 0);
      }
    }
  } finally {
    Config.props.bestFutatsumeTube = before;
  }
});
