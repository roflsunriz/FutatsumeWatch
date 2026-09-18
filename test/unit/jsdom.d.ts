// jsdom は型定義を同梱せず @types/jsdom も未導入のため、テスト用の最小宣言を用意する。
// 依存追加は禁止されているため、利用面（window / document / DOMParser 取得）に絞った形状とする。
declare module 'jsdom' {
  export class JSDOM {
    constructor(html?: string, options?: { url?: string; [key: string]: unknown });
    window: Record<string, unknown>;
  }
}
