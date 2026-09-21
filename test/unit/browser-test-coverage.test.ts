import { expect, test } from 'bun:test';
import {
  assertBrowserCoverage,
  requiredBrowserChecks,
  requiredBrowserParents,
  requiredSettingsFields,
} from '../../scripts/browser-test-coverage';
import { browserSuites } from '../../scripts/browser-test-options';
import type { BrowserSuite } from '../../scripts/browser-test-options';

function complete(suite: BrowserSuite) {
  return {
    completed: true,
    isolatedContexts: true,
    additionalTargets: {
      closeRejected: true,
      failures: ['frame', 'popup', 'service-worker'].map(
        (name) => `未登録通信: GET https://fixture.invalid/unregistered-${name}`
      ),
      observations: ['frame', 'popup', 'service-worker'].map((name) => ({
        url: `https://fixture.invalid/unregistered-${name}`,
        matched: false,
        intercepted: true,
      })),
    },
    workerStartup: {
      closeRejected: true,
      failures: ['Error: guard-worker-startup-throw', 'Error: guard-worker-startup-rejection'],
    },
    checks: [...requiredBrowserChecks[suite]],
    cases: (requiredBrowserParents[suite] ?? []).map((id) => ({ id, label: `親ケース ${id}` })),
    fields: requiredSettingsFields.map((field) => ({
      ...field,
      storageKey: `fixture_${field.key}`,
      inputs: ['changed', 'boundary'],
      verifiedInputs: ['changed', 'boundary'],
      invalidInputs: ['', '0.4', '2.1', '0.55', '#xyz', '/[/i', '/ok/ii'],
      saved: true,
      reopened: true,
      restored: true,
    })),
    observations: [
      { url: 'https://fixture.invalid/unregistered-page', matched: false, intercepted: true },
      {
        url: 'https://fixture.invalid/unregistered-worker',
        matched: false,
        intercepted: false,
        failure: 'net::ERR_PROXY_CONNECTION_FAILED',
      },
    ],
    ...(suite === 'guard'
      ? {
          failures: [
            '未登録通信: GET https://fixture.invalid/unregistered-page',
            '未捕捉通信: GET https://fixture.invalid/unregistered-worker',
          ],
        }
      : {}),
  };
}

test('必須操作を全部報告した各suiteだけを成功として数える', () => {
  for (const suite of browserSuites) expect(assertBrowserCoverage(suite, complete(suite)).count).toBeGreaterThan(0);
  expect(requiredSettingsFields).toHaveLength(77);
  expect(assertBrowserCoverage('settings', complete('settings')).settings).toBe(77);
});
test('0件、成功フラグ欠落、成功フラグとエラーの矛盾を拒否する', () => {
  expect(() => assertBrowserCoverage('entry', { completed: true, checks: [] })).toThrow('必須ケース');
  expect(() => assertBrowserCoverage('entry', { checks: requiredBrowserChecks.entry })).toThrow('完了');
  expect(() => assertBrowserCoverage('entry', { ...complete('entry'), errors: ['product error'] })).toThrow('失敗');
});
test('旧suiteで開始側だけ・復帰側だけ・1操作欠落を合格にしない', () => {
  for (const suite of ['entry', 'player', 'ui', 'migration', 'addons'] as const) {
    const report = complete(suite);
    report.checks.pop();
    expect(() => assertBrowserCoverage(suite, report)).toThrow('必須ケース');
    report.checks = [requiredBrowserChecks[suite][0]!];
    expect(() => assertBrowserCoverage(suite, report)).toThrow('必須ケース');
  }
});
test('新suiteは重要子チェックが全部あっても親ID欠落を拒否する', () => {
  for (const suite of ['functionality', 'library'] as const) {
    const report = complete(suite);
    const missing = suite === 'functionality' ? 'P1-10' : 'P4-01';
    report.cases = report.cases.filter((value) => value.id !== missing);
    expect(() => assertBrowserCoverage(suite, report)).toThrow(missing);
  }
  const report = complete('functionality');
  report.checks = report.checks.filter((label) => label !== '拒否時は本文と理由を保持');
  expect(() => assertBrowserCoverage('functionality', report)).toThrow('拒否時');
});
test('複合P3-02/03ラベルは両IDを示すが無関係な数字を親IDにしない', () => {
  const report = complete('library');
  report.cases = report.cases.filter((value) => value.id !== 'P3-02' && value.id !== 'P3-03');
  report.checks.push('P3-02/03 投稿者リンクと市場撤去');
  expect(assertBrowserCoverage('library', report).parents).toContain('P3-03');
  report.checks.pop();
  report.checks.push('項目02/03');
  // P3-02は独立したプロフィール実クリックの必須ラベルでも証明される。
  // 市場撤去のP3-03は複合ラベルを外すと欠落し、無関係な数字では補えない。
  expect(() => assertBrowserCoverage('library', report)).toThrow('P3-03');
});
test('設定が76件・重複・キー違いなら成功宣言でも拒否する', () => {
  const missing = complete('settings');
  missing.fields.pop();
  expect(() => assertBrowserCoverage('settings', missing)).toThrow('設定77件');
  const duplicate = complete('settings');
  duplicate.fields[1] = duplicate.fields[0]!;
  expect(() => assertBrowserCoverage('settings', duplicate)).toThrow('重複設定');
  const wrong = complete('settings');
  wrong.fields[0]!.key = 'unregistered';
  expect(() => assertBrowserCoverage('settings', wrong)).toThrow('P2-07/autoPlay');
});
test('入力の片方だけ、0候補、不正入力未確認、保存/再表示/復元漏れを拒否する', () => {
  for (const state of ['saved', 'reopened', 'restored'] as const) {
    const report = complete('settings');
    report.fields[0]![state] = false;
    expect(() => assertBrowserCoverage('settings', report)).toThrow(state);
  }
  const partial = complete('settings');
  partial.fields[0]!.verifiedInputs.pop();
  expect(() => assertBrowserCoverage('settings', partial)).toThrow('全入力');
  const empty = complete('settings');
  empty.fields[0]!.inputs = [];
  empty.fields[0]!.verifiedInputs = [];
  expect(() => assertBrowserCoverage('settings', empty)).toThrow('全入力');
  const invalid = complete('settings');
  invalid.fields.find((field) => field.id === 'P2-08/baseChatScale')!.invalidInputs = [];
  expect(() => assertBrowserCoverage('settings', invalid)).toThrow('不正入力');
});
test('guardのページだけ・Workerだけ・同じURL二重・成功応答を負例合格にしない', () => {
  const shared = complete('guard');
  shared.isolatedContexts = false;
  expect(() => assertBrowserCoverage('guard', shared)).toThrow('コンテキスト隔離');
  for (const index of [0, 1]) {
    const report = complete('guard');
    report.observations.splice(index, 1);
    expect(() => assertBrowserCoverage('guard', report)).toThrow('負例2件');
  }
  const duplicate = complete('guard');
  duplicate.observations[1] = duplicate.observations[0]!;
  expect(() => assertBrowserCoverage('guard', duplicate)).toThrow('unregistered-worker');
  const bypassed = complete('guard');
  bypassed.observations[0]!.matched = true;
  expect(() => assertBrowserCoverage('guard', bypassed)).toThrow('unregistered-page');
});
test('guardの起動直後例外欠落・監査成功終了・重複・想定外例外を拒否する', () => {
  const missing = complete('guard');
  missing.workerStartup.failures.pop();
  expect(() => assertBrowserCoverage('guard', missing)).toThrow('起動直後Worker');
  const accepted = complete('guard');
  accepted.workerStartup.closeRejected = false;
  expect(() => assertBrowserCoverage('guard', accepted)).toThrow('終了時拒否');
  const duplicate = complete('guard');
  duplicate.workerStartup.failures[1] = duplicate.workerStartup.failures[0]!;
  expect(() => assertBrowserCoverage('guard', duplicate)).toThrow('guard-worker-startup-rejection');
  const unexpected = complete('guard');
  unexpected.workerStartup.failures.push('unrelated error');
  expect(() => assertBrowserCoverage('guard', unexpected)).toThrow('起動直後Worker');
});
test('guardのiframe/popup/SWは欠落・重複・未捕捉・監査成功を拒否する', () => {
  for (const index of [0, 1, 2]) {
    const missing = complete('guard');
    missing.additionalTargets.observations.splice(index, 1);
    expect(() => assertBrowserCoverage('guard', missing)).toThrow('負例3件');
    const unobserved = complete('guard');
    unobserved.additionalTargets.observations[index]!.intercepted = false;
    expect(() => assertBrowserCoverage('guard', unobserved)).toThrow('unregistered-');
  }
  const duplicate = complete('guard');
  duplicate.additionalTargets.observations[1] = duplicate.additionalTargets.observations[0]!;
  expect(() => assertBrowserCoverage('guard', duplicate)).toThrow('unregistered-popup');
  const accepted = complete('guard');
  accepted.additionalTargets.closeRejected = false;
  expect(() => assertBrowserCoverage('guard', accepted)).toThrow('終了時拒否');
});
