import { expect, test } from 'bun:test';
import { getDateTimeInputKeys } from '../../scripts/dev-verify-library-comments';

test('datetime-localのキー入力順を日本語の24時間表示へ合わせる', () => {
  expect(
    getDateTimeInputKeys('2026-09-20T00:00:30', ['year', 'month', 'day', 'hour', 'minute', 'second'], false)
  ).toEqual(['2026', '09', '20', '00', '00', '30']);
});

test('datetime-localのキー入力順と午前午後を英語の12時間表示へ合わせる', () => {
  const segments = ['month', 'day', 'year', 'hour', 'minute', 'second', 'dayPeriod'] as const;
  expect(getDateTimeInputKeys('2099-01-01T00:00:00', segments, true)).toEqual([
    '01',
    '01',
    '2099',
    '12',
    '00',
    '00',
    'a',
  ]);
  expect(getDateTimeInputKeys('2099-01-01T13:00:00', segments, true)).toEqual([
    '01',
    '01',
    '2099',
    '01',
    '00',
    '00',
    'p',
  ]);
});
