import { defineConfig } from 'vite';
import monkey from 'vite-plugin-monkey';
import { VERSION } from './src/version.ts';
import { readFileSync } from 'node:fs';

export default defineConfig({
  define: { VER: JSON.stringify(VERSION), ENV: JSON.stringify('STABLE') },
  build: {
    target: 'es2022',
    minify: true,
    outDir: 'dist',
    rolldownOptions: {
      output: {
        // WorkerへtoString()で渡す関数の束縛を保ち、空白・コメントのみ圧縮する。
        minify: { mangle: false, compress: false, codegen: { removeWhitespace: true } },
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
          'ニコニコ動画の外付けプレイヤー。動画リンクや埋め込みサムネイルの右上に常時表示の起動ボタンを重ね、中央で再生、左上で設定、右上で詳細を操作。ホバー表示のタイトル下にタグ一覧、Nアニメ・ニコ百の関連サービス対応、利用可能フォントの選択、詳細の固定表示、コメント投稿・プレイリストに対応。',
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
          ].map((host) => `*://${host}.nicovideo.jp/*`),
          '*://*.nicovideo.jp/smile*',
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
