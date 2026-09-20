import { describe, expect, it } from 'bun:test';
import { resolve } from 'node:path';
import { browserEnvironment } from '../../scripts/dev-browser';

describe('手動検証と自動テストのブラウザ分離', () => {
  it('手動用は保存済みのプロファイルとheaded起動を維持する', () => {
    const manual = browserEnvironment(false);
    expect(manual.headed).toBe(true);
    expect(manual.port).toBe(9333);
    expect(manual.profile).toBe(resolve(process.env.USERPROFILE ?? '', 'Documents/.browser-debug/ChromeDev'));
    expect(manual.statePath).toBe(
      resolve(process.env.USERPROFILE ?? '', 'Documents/.browser-debug/chrome-dev-browser-state.json')
    );
  });

  it('自動テストは接続先・保存先・停止用PIDを手動用と共有しない', () => {
    const manual = browserEnvironment(false);
    const automated = browserEnvironment(true);
    expect(automated.headed).toBe(false);
    expect(automated.port).not.toBe(manual.port);
    expect(automated.profile).not.toBe(manual.profile);
    expect(automated.statePath).not.toBe(manual.statePath);
    expect(automated.profile).toBe(resolve(import.meta.dir, '../../dev-assets/browser-tests/profile'));
    expect(automated.chromePath).toBe(manual.chromePath);
  });
});
