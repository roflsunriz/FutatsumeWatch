import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { mediaSpec } from '../test/fixtures/functionality/media-spec';

// 公開映像を採取せず、ID別のテスト信号と色マーカーをHLSへエンコードする。
const output = resolve(import.meta.dir, '../test/fixtures/functionality/media');
const ffmpeg = process.env.FFMPEG_PATH ?? Bun.which('ffmpeg');
if (!ffmpeg) throw new Error('FFmpegを用意するかFFMPEG_PATHへ実行ファイルを指定してください');
for (const [id, spec] of Object.entries(mediaSpec)) {
  const directory = resolve(output, id);
  await mkdir(directory, { recursive: true });
  for (const name of ['low', 'high'] as const) {
    const size = spec[name];
    const child = Bun.spawn(
      [
        ffmpeg,
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        '-f',
        'lavfi',
        '-i',
        `testsrc2=size=${size.width}x${size.height}:rate=10`,
        '-f',
        'lavfi',
        '-i',
        `sine=frequency=${spec.frequency}:sample_rate=44100`,
        '-vf',
        `hue=h=${spec.hue},drawbox=x=iw/10:y=ih*7/10:w=iw/5:h=ih/5:color=${spec.marker}:t=fill`,
        '-t',
        String(spec.duration),
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        '35',
        '-pix_fmt',
        'yuv420p',
        '-g',
        '40',
        '-c:a',
        'aac',
        '-b:a',
        '32k',
        '-f',
        'hls',
        '-hls_time',
        '4',
        '-hls_playlist_type',
        'vod',
        '-hls_segment_filename',
        resolve(directory, `${name}-%02d.mpegts`),
        resolve(directory, `${name}.m3u8`),
      ],
      { stdout: 'inherit', stderr: 'inherit' }
    );
    if (await child.exited) throw new Error(`検証映像の生成に失敗: ${id}/${name}`);
  }
  await Bun.write(
    resolve(directory, 'master.m3u8'),
    `#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=180000,RESOLUTION=${spec.low.width}x${spec.low.height}\nlow.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=400000,RESOLUTION=${spec.high.width}x${spec.high.height}\nhigh.m3u8\n`
  );
}
