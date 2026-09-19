import { defineConfig } from 'vite';
import monkey from 'vite-plugin-monkey';
import { VERSION } from './src/version.ts';
import { readFileSync } from 'node:fs';

export default defineConfig({
  define: { VER: JSON.stringify(VERSION), ENV: JSON.stringify('STABLE') },
  build: {
    target: 'es2022',
    minify: false,
    outDir: 'dist',
    rolldownOptions: {
      output: {
        banner: `/*!\n${readFileSync(new URL('./node_modules/comment-overlay/LICENSE', import.meta.url), 'utf8')}\n*/`,
      },
    },
  },
  plugins: [
    monkey({
      entry: 'src/main.ts',
      userscript: {
        name: 'FutatsumeWatch',
        namespace: 'https://github.com/roflsunriz/FutatsumeWatch/',
        version: VERSION,
        author: 'roflsunriz',
        description:
          'ニコニコ動画の外付けプレイヤー。動画情報欄・検索結果の重なった四角形アイコンから起動。中央で再生、左上で設定、右上で詳細。6種類の設定画面を共通デザインに統一し、背景ぼかし・背景クリック・Escapeで閉じる操作に対応。',
        match: [
          ...[
            'www',
            'ext',
            'blog',
            'ch',
            'com',
            'commons',
            'dic',
            'ex',
            'info',
            'search',
            'uad',
            'api.search',
            'site',
            'anime',
            'live',
          ].map((host) => `*://${host}.nicovideo.jp/*`),
          '*://*.nicovideo.jp/smile*',
          '*://embed.nicovideo.jp/watch/*',
          '*://sp.nicovideo.jp/watch/*',
          'https://www.upload.nicovideo.jp/niconico-garage/video/*',
          'https://www.youtube.com/*',
          'https://youtube.com/*',
          'https://www.google.com/search*',
          'https://www.google.co.jp/search*',
          'https://*.bing.com/*',
          'https://feedly.com/*',
        ],
        exclude: [
          '*://ads*.nicovideo.jp/*',
          '*://www.nicovideo.jp/watch/*?edit=*',
          '*://ch.nicovideo.jp/tool/*',
          '*://flapi.nicovideo.jp/*',
          '*://dic.nicovideo.jp/p/*',
          '*://ext.nicovideo.jp/thumb_channel/*',
        ],
        grant: 'none',
        'run-at': 'document-end',
        downloadURL: 'https://github.com/roflsunriz/FutatsumeWatch/raw/main/dist/FutatsumeWatch.user.js',
        updateURL: 'https://github.com/roflsunriz/FutatsumeWatch/raw/main/dist/FutatsumeWatch.user.js',
      },
      build: { fileName: 'FutatsumeWatch.user.js', metaFileName: false, systemjs: 'inline' },
      server: { open: false },
    }),
  ],
});
