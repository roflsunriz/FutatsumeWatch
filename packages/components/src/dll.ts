// 実行時値はブラウザーでは CDN の ESM URL、bun/node では npm の lit で解決する。
// 連結ビルドでは import 行自体が取り除かれるため製品出力は変わらない。
import * as lit from 'lit/html.js';
import { repeat } from 'lit/directives/repeat.js';
import { classMap } from 'lit/directives/class-map.js';

import type * as litTypes from 'lit/html.js';
import type { repeat as repeatDirective } from 'lit/directives/repeat.js';
import type { classMap as classMapDirective } from 'lit/directives/class-map.js';

interface DllShape {
  lit: typeof litTypes;
  directives: { repeat: typeof repeatDirective; classMap: typeof classMapDirective };
}

const dll: DllShape = { directives: {} } as DllShape;
//===BEGIN===
dll.lit = lit;
dll.directives.repeat = repeat;
dll.directives.classMap = classMap;
//===END===
export { dll };
