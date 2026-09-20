import { describe, expect, test } from 'bun:test';
import type {
  NicoVideoPlayer as NicoVideoPlayerType,
  VideoPlayer as VideoPlayerType,
} from '../../src/nico-video-player';
import { CONSTANT } from '../../src/constant';
import { PlayerState } from '../../src/state';
import { Config } from '../../src/config';
await Config.promise('restore');
const { NicoVideoPlayer, VideoPlayer } = await import('../../src/nico-video-player');

function fixture(): {
  player: NicoVideoPlayerType;
  video: VideoPlayerType;
  media: HTMLVideoElement;
  sources: string[];
} {
  const media = document.createElement('video');
  const video = Object.create(VideoPlayer.prototype) as VideoPlayerType;
  video._videoElement = media;
  video._currentVideo = media;
  const sources: string[] = [];
  video.setSrc = (source: string) => {
    sources.push(source);
  };
  const player = Object.create(NicoVideoPlayer.prototype) as NicoVideoPlayerType;
  player._videoPlayer = video;
  player._playerConfig = { props: { autoPlay: true } };
  return { player, video, media, sources };
}

describe('自動再生設定の実mediaへの接続', () => {
  test('状態の初期値は設定を引き継ぐ', () => {
    for (const value of [false, true]) {
      const state = new PlayerState({ props: { ...Config.props, autoPlay: value } });
      expect(state.isAutoPlay).toBe(value);
    }
  });
  test('公開getter/setterと旧メソッドは同じautoplayを読む', () => {
    const { player, video, media } = fixture();
    player.isAutoPlay = true;
    expect(media.autoplay).toBe(true);
    expect(video.getIsAutoPlay()).toBe(true);
    video.setIsAutoPlay(false);
    expect(player.isAutoPlay).toBe(false);
    expect(media.autoplay).toBe(false);
  });
  test('設定変更を実mediaへ伝え、次の動画でも保存値に従う', async () => {
    const { player, media } = fixture();
    player._onPlayerStateUpdate('isAutoPlay', false);
    expect(media.autoplay).toBe(false);
    player._playerConfig.props.autoPlay = false;
    await player.setVideo('https://media.invalid/one.m3u8');
    expect(media.autoplay).toBe(false);
    player._playerConfig.props.autoPlay = true;
    await player.setVideo('https://media.invalid/two.m3u8');
    expect(media.autoplay).toBe(true);
  });
  test('一回限りの再読込指定は空動画では消費せず、次の通常動画へ残さない', async () => {
    const { player, media, sources } = fixture();
    player.setNextAutoPlay(false);
    await player.setVideo(CONSTANT.BLANK_VIDEO_URL);
    await player.setVideo('https://media.invalid/reload.m3u8');
    expect(media.autoplay).toBe(false);
    expect(player._playerConfig.props.autoPlay).toBe(true);
    await player.setVideo('https://media.invalid/next.m3u8');
    expect(media.autoplay).toBe(true);
    expect(sources).toHaveLength(3);
  });
  test('再読み込みを中断した切替は未消費の一時停止指定を解除できる', async () => {
    const { player, media } = fixture();
    player.setNextAutoPlay(false);
    await player.setVideo(CONSTANT.BLANK_VIDEO_URL);
    player.setNextAutoPlay(undefined);
    await player.setVideo('https://media.invalid/other-video.m3u8');
    expect(media.autoplay).toBe(true);
    expect(player._playerConfig.props.autoPlay).toBe(true);
  });
  test('canPlayは実プレイヤーへ再生を要求し、拒否を通知する', async () => {
    const { player, video } = fixture();
    const events: string[] = [];
    player.emit = (event: string) => {
      events.push(event);
      return player;
    };
    let played = 0;
    video.play = () => {
      played++;
      return Promise.reject(new DOMException('fixture blocked', 'NotAllowedError'));
    };
    player.isAutoPlay = false;
    player._onVideoCanPlay();
    expect(played).toBe(0);
    player.isAutoPlay = true;
    player._onVideoCanPlay();
    await Promise.resolve();
    expect(played).toBe(1);
    expect(events).toEqual(['canPlay', 'canPlay', 'autoplay-rejected']);
  });
});
