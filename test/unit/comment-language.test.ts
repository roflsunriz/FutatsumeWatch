import { afterEach, expect, test } from 'bun:test';
import { Config } from '../../src/config';
import { applyApiCommentLanguage } from '../../src/comment-language';
import type { CommentLanguageInfo } from '../../src/comment-language';

await Config.promise('restore');
const original = Config.props.commentLanguage;

afterEach(() => Config.setValue('commentLanguage', original));

test('コメントAPIの言語を保存設定より優先し、送信情報と表示設定を一致させる', () => {
  Config.setValue('commentLanguage', 'en-us');
  const msgInfo = {
    language: 'en-us',
    nvComment: {
      params: { language: 'ja-jp', targets: [{ id: '1282111045', fork: 'main' }] },
      server: 'https://public.nvcomment.nicovideo.jp',
      threadKey: 'fixture',
    },
  };
  const language = applyApiCommentLanguage(msgInfo, Config.props.commentLanguage);
  Config.setValue('commentLanguage', language);

  expect(msgInfo.language).toBe('ja-jp');
  expect(msgInfo.nvComment.params.language).toBe('ja-jp');
  expect(language).toBe('ja-jp');
  expect(Config.props.commentLanguage).toBe('ja-jp');
});

test('APIが言語を指定しない場合だけ保存設定へフォールバックする', () => {
  const msgInfo: CommentLanguageInfo = { nvComment: { params: {} } };
  expect(applyApiCommentLanguage(msgInfo, 'en-us')).toBe('en-us');
  expect(msgInfo.language).toBe('en-us');
});
