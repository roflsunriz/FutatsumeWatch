// 連結スコープ由来のグローバル宣言。
// ビルド時（CDN の @require・ビルダーの @version/@environment 注入）に提供される値の型を表す。
// このファイル自体は生成物に含まれない（requireFile の解決対象外の .d.ts）。
// $ / jQuery は @types/jquery、_ は @types/lodash の UMD グローバルを使い、
// モジュールからの値参照は tsconfig の allowUmdGlobalAccess で許容する。

/// <reference types="jquery" />
/// <reference types="lodash" />

declare const VER: string;
declare const ENV: 'DEV' | 'STABLE';
