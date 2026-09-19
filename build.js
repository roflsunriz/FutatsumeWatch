var srcDir = './src';
var outFile = 'dist/FutatsumeWatch.user.js';
var watchDirs = [
  srcDir,
  './packages/components/src',
  './packages/navi/src',
  './packages/lib/src',
  './packages/zenza/src',
];

var templates = [
  { src: '_template.js', dist: 'dist/FutatsumeWatch.user.js',            dev: true  },
  { src: '_uquery.js',   dist: 'dist/uQuery.user.js',                dev: false },
  { src: '_pocket.js',   dist: 'dist/MylistPocket.user.js',          dev: false },
  { src: '_shape.js',    dist: 'dist/MaskedWatch.user.js',           dev: false },
  { src: '_setting.js',  dist: 'dist/FutatsumeAdvancedSettings.user.js', dev: false },
  { src: '_hls.js',      dist: 'dist/FutatsumeHLS.user.js',              dev: false },
  { src: '_gamepad.js',  dist: 'dist/FutatsumeGamePad.user.js',          dev: false },
  { src: '_blog.js',     dist: 'dist/FutatsumeBlogPartsButton.user.js',  dev: false },
  { src: '_captube.js',  dist: 'dist/CapTube.user.js',               dev: false },
  { src: '_heatsync.js', dist: 'dist/HeatSync.user.js',              dev: false },
  // { src: '_my4.js',      dist: 'dist/MylistFilter.user.js',          dev: false },
  // { src: '_navi.js',    dist: 'dist/Navi.user.js', dev: false },
  // { src: '_yomi.js',    dist: 'dist/Yomi.user.js', dev: false },
  // { src: '_vc.js',    dist: 'dist/VoiceControl.user.js', dev: false }
];

const DEV_HEADER = {
  '_template.js': {
    //name: '// @name           FutatsumeWatch DEV版',
    name: '// @name           FutatsumeWatch DEV版 fix playlist',
    description: '// @description    FutatsumeWatchの開発先行バージョン（安定版と同機能。導入後に動画ページを開くと外付け再生。直近: 改名と起動不能級の連結不具合を修正）'
  },
  '_uquery.js': {},
  '_pocket.js': {},
  '_yomi.js': {},
  '_vc.js': {},
  '_shape.js': {},
  '_setting.js': {},
  '_hls.js': {},
  '_gamepad.js': {},
  '_blog.js': {},
  '_captube.js': {},
  '_my4.js': {},
  '_heatsync': {},
};

let REQMAP = {};

const throttle = (func, interval) => {
  let lastTime = 0;
  let lastArgs = null;
  let timer;
  const result = (...args) => {
    const now = Date.now();
    const timeDiff = now - lastTime;

    if (timeDiff < interval) {
      lastArgs = args;
      if (!timer) {
        timer = setTimeout(() => {
          lastTime = Date.now();
          timer = null;
          func.apply(null, lastArgs);
          lastArgs = null;
        }, Math.max(interval - timeDiff, 0));
      }
      return;
    }

    if (timer) {
      timer = clearTimeout(timer);
    }
    lastTime = now;
    lastArgs = null;
    func(...args);
  };
  result.cancel = () => {
    if (timer) {
      timer = clearTimeout(timer);
    }
  };
  return result;
};


const debounce = (func, interval) => {
  let timer;
  const result = (...args) => {
    if (timer) {
      timer = clearTimeout(timer);
    }
    timer = setTimeout(() => func(...args), interval);
  };
  result.cancel = () => {
    if (timer) { timer = clearTimeout(timer); }
  };
  return result;
};

// import/export 文の解決は TypeScript パーサーで行う。
// prettier による複数行 import や `import type`、`as` 別名に対応するため、
// 行単位の正規表現ではなく AST で文の範囲を求める。
// skipExports が真の場合は export 系宣言（値を持たない物）も除外する。
// 値を持つ export（export const 等）は除外せず、生成物に混入したら
// scripts/build.ts の node --check で検出する。
function parseModuleStatements(text, filename, skipExports) {
  let ts;
  try {
    ts = require('typescript');
  } catch (e) {
    console.error('TypeScript が見つかりません。bun install を実行してください。');
    throw e;
  }
  const sourceFile = ts.createSourceFile(filename, text, ts.ScriptTarget.Latest, true);
  const imports = {};
  const skipRanges = [];
  const toRange = node => {
    const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line;
    const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line;
    return [start, end];
  };
  const toModulePath = specText => {
    const raw = specText.replace(/^['"]|['"]$/g, '');
    return raw.replace(/\.(js|ts)$/, '') + '.js';
  };
  sourceFile.statements.forEach(node => {
    if (ts.isImportDeclaration(node)) {
      const clause = node.importClause;
      const modulePath = toModulePath(node.moduleSpecifier.getText(sourceFile));
      if (clause) {
        if (clause.name) {
          imports[clause.name.text] = modulePath;
        }
        const bindings = clause.namedBindings;
        if (bindings) {
          if (ts.isNamespaceImport(bindings)) {
            imports[bindings.name.text] = modulePath;
          } else if (ts.isNamedImports(bindings)) {
            bindings.elements.forEach(el => {
              imports[el.name.text] = modulePath;
            });
          }
        }
      }
      skipRanges.push(toRange(node));
    } else if (
      skipExports &&
      (ts.isExportDeclaration(node) || ts.isExportAssignment(node) ||
        ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node))
    ) {
      skipRanges.push(toRange(node));
    }
  });
  return { imports, skipRanges };
}

function isSkippedLine(ranges, index) {
  return ranges.some(([s, e]) => index >= s && index <= e);
}

// TypeScript 移行期: 連結対象の .ts を取り除く前の型注釈だけを取り除く。
// 型検査は tsc（bun run type-check）が担い、ここでは transpile のみ行う。
// isolatedModules 相当のため、値として残る構文（enum・namespace・
// パラメータープロパティ・デコレーター）は .ts 資産で使用禁止とする。
// import/export 文はマーカー外に置く規約とし、生成物への混入は
// scripts/build.ts の node --check で検出する。
function transpileTypeScript(text, filename) {
  let ts;
  try {
    ts = require('typescript');
  } catch (e) {
    console.error('TypeScript が見つかりません。bun install を実行してください。');
    throw e;
  }
  const result = ts.transpileModule(text, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.ESNext,
    },
    fileName: filename,
  });
  return result.outputText;
}

function writeIfModified(file, newData, callback) {
  var fs = require('fs');
  // 同期書き込みにする。非同期（setTimeout 待機）ではプロセス終了時に
  // 書き込みが失われ、dist が更新されないことがある。
  try {
    var oldData = fs.readFileSync(file, 'utf-8');
    if (oldData === newData) {
      // callback('Not Modified', null);
      return;
    }

    fs.writeFileSync(file, newData);
    callback('OK', newData);
  } catch (e) {
    console.log('Exception: ', e);
    fs.writeFileSync(file, newData);
    callback('OK', newData);
  }
}

async function notify(title, message, options = {timeout: 3, subtitle: undefined}) {
  const notifier = require('node-notifier');
  let {timeout, subtitle} = options;
  notifier.notify({title, message, timeout, subtitle});
}

function requireFile(srcDir, file, params, parent = '') {
  var fs = require('fs');
  var path = require('path');
  var lines = [];
  var begin = false;
  var isComment = false;
  var trim = false; //!params.dev && !/NicoTextParser\.js/.test(file);
  var srcFile = path.join(srcDir, file);
  // TypeScript 移行期: .js がなければ .ts へフォールバックする。
  if (!fs.existsSync(srcFile) && srcFile.endsWith('.js')) {
    const tsFile = srcFile.slice(0, -3) + '.ts';
    if (fs.existsSync(tsFile)) {
      srcFile = tsFile;
    }
  }
  var ignore = false;
  const imports = {};
  const fullpath = path.resolve(srcFile);
  if (REQMAP[fullpath]) {
    REQMAP[fullpath].push(parent);
    console.warn('***WARN***\n"%s" has already required\n in\n %s', fullpath, REQMAP[fullpath].join('\n '));
    // notify('already required', srcFile, parent);
    return `// already required`;
  }
  REQMAP[fullpath] = REQMAP[fullpath] || [];
  REQMAP[fullpath].push(parent || 1);
  try {
    fs.statSync(srcFile);
  } catch (e) {
    console.error('*** Error: %s\n\t   "%s"', e.message || e, srcFile);
    console.log(` required by "${parent}"`);
    notify('build error', `${e.message}\n${file}`);
    return `fild not exist "${srcFile}"\nfrom "${parent}"`;
  }
  let sourceText = fs.readFileSync(srcFile, 'utf-8');
  // インポートマップは原文から作る。transpile は型のみの import を除去するため、
  // transpiled テキストから作ると実行時に必要な名前が欠落する。
  const parsedMap = parseModuleStatements(sourceText, srcFile, false);
  Object.assign(imports, parsedMap.imports);
  // BEGIN/END 内配置の規約違反チェックは原文の位置で行う。transpile が
  // 先頭コメント除去や副作用なし export（`export {};` 等）の末尾移動を行うため、
  // transpiled 位置で範囲を求めると誤検出・連結漏れになる。
  const origLines = sourceText.split('\n');
  let origBegin = -1;
  let origEnd = -1;
  origLines.forEach((l, i) => {
    if (origBegin < 0 && /\/\/=+BEGIN=+/.test(l)) {
      origBegin = i;
    } else if (origBegin >= 0 && origEnd < 0 && /\/\/=+END=+/.test(l)) {
      origEnd = i;
    }
  });
  parsedMap.skipRanges.forEach(([s]) => {
    if (origBegin >= 0 && origEnd >= 0 && s > origBegin && s < origEnd) {
      throw new Error(`import 文が //==BEGIN== 内にあります: ${srcFile}:${s + 1}`);
    }
  });
  // 連結範囲は原文の BEGIN/END 内だけを切り出してから transpile する。
  // マーカーがないファイルは従来通り全体を対象にする。
  const hasMarkers = origBegin >= 0 && origEnd >= 0;
  const bodyText = hasMarkers ? origLines.slice(origBegin + 1, origEnd).join('\n') : sourceText;
  let linkedText = bodyText;
  if (srcFile.endsWith('.ts')) {
    linkedText = transpileTypeScript(bodyText, srcFile);
  }
  // 連結範囲内の値なし export 宣言が残ると生成物が classic script として
  // 死ぬ（node --check は ESM 検出で通過するため検出できない）。値なし export 節・
  // 空 export・型宣言はここで除外する。値付き export が範囲内にあれば
  // 規約違反のため、除外せず残して scripts/build.ts の直接検出で落とす。
  const parsed = parseModuleStatements(linkedText, srcFile, true);
  const sourceLines = linkedText.split('\n');
  // マーカーは切り出し済みのため、範囲内テキストは無条件に連結対象とする。
  begin = hasMarkers;
  sourceLines.some(function(line, index) {
    if (isSkippedLine(parsed.skipRanges, index)) {
      return;
    }
    let lt = line.trim();

    if (lt.startsWith('//@ignore-disable')) {
      ignore = false;
      return;
    } else if (ignore) {
      return;
    } else if (lt.startsWith('//@ignore-enable')) {
      ignore = true;
      return;
    }

    if (lt.match(/\/\/=+BEGIN=+/)) {
      begin = true;
      return;
    }

    lt = lt.replace(/\/\*\*(.*)\*\//g, '');
    if (!isComment && lt.match(/\/\*\*/)) {
      isComment = true;
      // console.log(file, '>', lt);
      lt = lt.replace(/\/\*\*.*/, '');
    } else if (isComment && lt.match(/\*\//)) {
      isComment = false;
      // console.log(file, '>', lt);
      lt = lt.replace(/^.*\*\//, '');
    } else if (isComment) {
      // console.log(file, '>', lt);
      return;
    }
    if (lt.startsWith('//') && !lt.match(/\/\/\s*[@=]/)) {
      return;
    }

    if (begin) {
      if (lt.match(/\/\/=+END=+/)) {
        return true;
      }

      if ((params.dev && line.match(/^\s*\/\/@dev-require (.+)$/)) ||
          line.match(/^\s*\/\/@require (.+)$/)) {
        const m = (RegExp.$1 || '').trim()
        var f = path.join(path.dirname(srcFile), imports[m] || m);
        // imports[m] ? console.log('import ' + f) : console.log('require ' + f);
        lines.push(requireFile(path.dirname(f), path.basename(f), params, path.resolve(srcFile)));
        return;
      }

      // if (!trim) {
      //   lines.push(line);
      //   return;
      // }
      if (lt.length === 0) { return; }
      if (trim) {
        lines.push(line.replace(/^[\s]+/g, '').replace(/([ ]+)/g, ' ')
        );
      } else {
        lines.push(line.replace(/^([\s+]+)/, g => '\t'.repeat(g.length / 2)));
      }
    }
  });

  return lines.join('\n');
}

function deploy(srcFile) {
  var path = require('path');
  var fs   = require('fs');
  if (!fs.existsSync('setting.json')) {
    console.log('setting.json not exist');
    return;
  }

  var setting = JSON.parse(fs.readFileSync('setting.json', 'utf-8'));
  setting.deployTo.some(function(dir) {
    // console.log('deploy To: ', dir);
    if (!fs.existsSync(dir)) {
      // console.log('path not exist: ', dir);
      return;
    }
    var destFile = dir.replace(/\/+$/, '') + '/' + path.basename(srcFile);
    // console.log('deploy file: ', destFile);

    // fs.createReadStream(srcFile).pipe(fs.createWriteStream(destFile));
    writeIfModified(destFile, fs.readFileSync(srcFile, 'utf-8'), function(err, newData) {
      // console.log(err);
    })
  });
}


function loadTemplateFile(srcDir, indexFile, outFile, params) {
  var fs = require('fs');
  var path = require('path');
  var lines = [];
  var ver = null;
  const imports = {};
  let srcFile = path.join(srcDir, indexFile);
  // テンプレート自体が .ts 化された場合のフォールバック（現状は .js）。
  if (!fs.existsSync(srcFile) && srcFile.endsWith('.js')) {
    const tsFile = srcFile.slice(0, -3) + '.ts';
    if (fs.existsSync(tsFile)) {
      srcFile = tsFile;
    }
  }

  let templateText = fs.readFileSync(srcFile, 'utf-8');
  // インポートマップは原文から作る（transpile による型のみ import の除去で欠落するため）。
  const parsedMapTemplate = parseModuleStatements(templateText, srcFile, false);
  Object.assign(imports, parsedMapTemplate.imports);
  if (srcFile.endsWith('.ts')) {
    templateText = transpileTypeScript(templateText, srcFile);
  }
  const parsedTemplate = parseModuleStatements(templateText, srcFile, true);
  Object.assign(imports, parsedTemplate.imports);
  templateText.split('\n').some(function(line, index) {
    if (isSkippedLine(parsedTemplate.skipRanges, index)) {
      return;
    }
    if (params.dev) {
      if (line.match(/^\/\/\s*@([a-z0-9+]+)(.*)$/)) {
        let name = RegExp.$1;
        // console.log('header:', indexFile, name, RegExp.$2);
        if (DEV_HEADER[indexFile][name]) {
          line = DEV_HEADER[indexFile][name].trim();
        }
      }
    }
    if (line.match(/\/\/ *==\/UserScript==/)) {
      lines.push(`// @downloadURL    https://github.com/roflsunriz/FutatsumeWatch/raw/main/${outFile}`);
      // meta.js でUserScriptブロックのみを含んだファイルを用意すると嬉しいやつ。そうでなければdownloadURLだけ持っていれば良い
      // lines.push(`// @updateURL      https://github.com/kphrx/ZenzaWatch/raw/playlist-deploy/${outFile}`);
      lines.push(line);
      lines.push('/* eslint-disable */');
      return;
    }
    if (line.match(/^(\s*)\/\/\s*@environment$/)) {
      lines.push(`${RegExp.$1}const ENV = '${params.dev ? 'DEV' : 'STABLE'}';\n`);
      return;
    }
    if (line.match(/^(\s*)\/\/\s*@version(.*)$/)) {
      if (!ver) {
        ver = RegExp.$2.trim();
        console.log('ver: ' + ver);
        lines.push(line);
      } else {
        lines.push(RegExp.$1 + 'var VER = \'' + ver + '\';');
      }
      return;
    }
    if ((params.dev && line.match(/^\s*\/\/@dev-require (.+)$/)) ||
      line.match(/^\s*\/\/@require (.+)$/)) {
      const m = (RegExp.$1 || '').trim()
      var f = path.join(path.dirname(srcFile), imports[m] || m);
      // imports[m] ? console.log('import ' + f) : console.log('require ' + f);
      lines.push(requireFile(path.dirname(f), path.basename(f), params, path.resolve(srcFile)));
      return;
    }
    lines.push(line);
  });

  writeIfModified(outFile, lines.join('\n'), function(err, newData) {
    err && console.log(err);
    if (newData) {
      console.log(`\n>>>>>>update "${outFile}" (${lines.join('\n').split('\n').length} lines)`);
      deploy(outFile);
    }
  });
}

function build(params) {
  var path = require('path');
  templates.forEach(template => {
    var _params = {...params};
    var templateFile = template.src;
    var outFile = template.dist;
    _params.dev = template.dev && params.dev;
    if (_params.dev && !/-dev\.user\.js$/.test(outFile)) {
      outFile = outFile.replace(/\.user\.js$/, '-dev.user.js');
    }
    console.log('\n>>>>>>build: %s', path.basename(outFile));
    REQMAP = {};
    loadTemplateFile(srcDir, templateFile, outFile, _params);
  });
}
const _build = debounce(build, 1000);

function watch(srcDir, params) {
  var fs = require('fs');
  const onChange = async function(event, filename) {
    if (event === 'rename') { // Dropbox経由の更新など
      _build.cancel();
      await new Promise(res => setTimeout(res, Math.random() * 3000));
    }
    console.log('event: "%s", file: "%s"', event, filename);
    try {
      _build(params);
    } catch(e) {
      console.error('error: ', e);
      notify('build error', `${e.message}`);
    }
  };

  fs.watch(srcDir, {recursive: true}, onChange);
}

function run() {
  let params = {};
  process.argv.concat().splice(-2).forEach(v => {
    if (/^--(.+)$/.test(v)) {
      params[RegExp.$1] = 1;
    } else if (/^([a-z0-9]+)=(.*)$/.test(v)) {
      params[RegExp.$1] = RegExp.$2;
    }
  });

  console.log(params);
  build(params);
  if (params.watch) {
    notify('watch start', new Date().toLocaleString());
    watchDirs.forEach(dir => { watch(dir, params); });
  }
}

try {
  run();
} catch(e) {
  console.error('error', e);
  console.trace();
  notify('error', `${e.message || e}`);
}


