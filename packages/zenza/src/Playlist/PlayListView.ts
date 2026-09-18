import { VideoListView } from './VideoListView';
import type { PlayListModel } from './PlayListModel';
import { Emitter } from '../../../lib/src/Emitter';
import { cssUtil } from '../../../lib/src/css/css';
import { ClassList } from '../../../lib/src/dom/ClassListWrapper';
import { uq } from '../../../lib/src/uQuery';
import { global } from '../../../../src/ZenzaWatchIndex';

interface PlayListViewParams {
  container: Element;
  model: PlayListModel;
  playlist: PlayListLike;
}

interface PlayListLike {
  on(name: string, handler: (...args: unknown[]) => void): void;
  readonly isEnable: boolean;
  readonly isLoop: boolean;
  getIndex(): number;
  readonly length: number;
}

interface UqRaf {
  addClass(name: string): void;
  removeClass(name: string): void;
}

interface UqCollection {
  on(name: string, handler: (e: MouseEvent) => void, options?: unknown): UqCollection;
  addClass(name: string): UqCollection;
  removeClass(name: string): UqCollection;
  mapQuery(map: Record<string, string>): {
    e: Record<string, Element>;
    $: Record<string, UqCollection & { raf: UqRaf }>;
  };
  readonly length: number;
  [index: number]: Element;
}

interface UqStatic {
  (selector: string): UqCollection;
  html(html: string): UqCollection;
}

interface CssUtilLike {
  addStyle(css: string, id?: string): void;
}

interface ClassListWrapper {
  add(name: string): void;
  remove(name: string): void;
  toggle(name: string, force?: boolean): void;
}

interface ClassListFactory {
  (view: Element): ClassListWrapper;
}

interface GlobalEmitterLike {
  emitter: {
    on(name: string, handler: (...args: unknown[]) => void): void;
    emitAsync(name: string, ...args: unknown[]): void;
  };
  debug: Record<string, unknown>;
}

//===BEGIN===

class PlayListView extends Emitter {
  declare static __css__: string;
  declare static __tpl__: string;
  declare _container: Element;
  declare _model: PlayListModel;
  declare _playlist: PlayListLike;
  declare _$view: UqCollection;
  declare classList: ClassListWrapper;
  declare _index: Element;
  declare _length: Element;
  declare _menu: Element;
  declare _fileDrop: Element;
  declare _fileSelect: Element;
  declare _playlistFrame: Element;
  declare _$menu: { raf: UqRaf };
  declare _$fileDrop: UqCollection & { raf: UqRaf };
  declare _$fileSelect: UqCollection;
  declare _listView: VideoListView;
  declare addClass: (...args: unknown[]) => unknown;
  declare removeClass: (...args: unknown[]) => unknown;
  declare scrollTop: (...args: unknown[]) => unknown;
  declare scrollToItem: (...args: unknown[]) => unknown;
  constructor(...args: [PlayListViewParams]) {
    super();
    this.initialize(...args);
  }
  initialize(params: PlayListViewParams): void {
    this._container = params.container;
    this._model = params.model;
    this._playlist = params.playlist;

    const css = cssUtil as unknown as CssUtilLike;
    const uqFn = uq as unknown as UqStatic;
    const classListFactory = ClassList as unknown as ClassListFactory;
    const globalLike = global as unknown as GlobalEmitterLike;
    css.addStyle(PlayListView.__css__);
    const $view = (this._$view = uqFn.html(PlayListView.__tpl__));
    const viewRoot = $view[0]!;
    this.classList = classListFactory(viewRoot);
    this._container.append(viewRoot);
    const mq = $view.mapQuery({
      _index: '.playlist-index',
      _length: '.playlist-length',
      _menu: '.playlist-menu',
      _fileDrop: '.playlist-file-drop',
      _fileSelect: '.import-playlist-file-select',
      _playlistFrame: '.playlist-frame',
    });
    Object.assign(this, mq.e);
    Object.assign(this, mq.$);

    globalLike.debug.playlistView = this._$view;

    const listView = (this._listView = new VideoListView({
      container: this._playlistFrame,
      model: this._model,
      className: 'playlist',
      dragdrop: true,
      dropfile: true,
      enablePocketWatch: false,
    }));
    listView.on('command', this._onCommand.bind(this));
    listView.on('deflistAdd', this._onDeflistAdd.bind(this));
    listView.on('moveItem', (src: unknown, dest: unknown) => this.emit('moveItem', src, dest));
    listView.on('filedrop', (data: unknown) => this.emit('command', 'importFile', data));

    this._playlist.on('update', _.debounce(this._onPlaylistStatusUpdate.bind(this), 100));

    this._$view.on('click', this._onPlaylistCommandClick.bind(this));
    globalLike.emitter.on('hideHover', () => {
      this._$menu.raf.removeClass('show');
      this._$fileDrop.raf.removeClass('show');
    });
    uqFn('.zenzaVideoPlayerDialog')
      .on('dragover', this._onDragOverFile.bind(this))
      .on('dragenter', this._onDragEnterFile.bind(this))
      .on('dragleave', this._onDragLeaveFile.bind(this))
      .on('drop', this._onDropFile.bind(this));

    this._$fileSelect.on('change', this._onImportFileSelect.bind(this));

    (
      ['addClass', 'removeClass', 'scrollTop', 'scrollToItem'] as Array<
        'addClass' | 'removeClass' | 'scrollTop' | 'scrollToItem'
      >
    ).forEach((func) => {
      const self = this as unknown as Record<string, (...args: unknown[]) => unknown>;
      const view = listView as unknown as Record<string, (...args: unknown[]) => unknown>;
      self[func] = (view[func] as (...args: unknown[]) => unknown).bind(listView);
    });
  }
  toggleClass(className: string, v?: boolean): void {
    this.classList.toggle(className, v);
  }
  _onCommand(command: unknown, param: unknown, itemId: unknown): void {
    switch (command) {
      default:
        this.emit('command', command, param, itemId);
        break;
    }
  }
  _onDeflistAdd(watchId: unknown, itemId: unknown): void {
    this.emit('deflistAdd', watchId, itemId);
  }
  _onPlaylistCommandClick(e: MouseEvent): void {
    const globalLike = global as unknown as GlobalEmitterLike;
    const target = (e.target as unknown as Element).closest('.playlist-command');
    if (!target) {
      return;
    }
    const { command, param } = (target as HTMLElement).dataset;
    e.stopPropagation();
    if (!command) {
      return;
    }
    switch (command) {
      case 'importFileMenu':
        this._$menu.raf.removeClass('show');
        this._$fileDrop.addClass('show');
        return;
      case 'toggleMenu':
        e.stopPropagation();
        e.preventDefault();
        this._$menu.raf.addClass('show');
        return;
      case 'shuffle':
      case 'sortBy':
      case 'reverse':
        this.classList.add('shuffle');
        window.setTimeout(() => this.classList.remove('shuffle'), 1000);
        this.emit('command', command, param);
        break;
      default:
        this.emit('command', command, param);
    }
    globalLike.emitter.emitAsync('hideHover');
  }
  _onPlaylistStatusUpdate(): void {
    const playlist = this._playlist;
    this.classList.toggle('enable', playlist.isEnable);
    this.classList.toggle('loop', playlist.isLoop);
    this._index.textContent = String(playlist.getIndex() + 1);
    this._length.textContent = String(playlist.length);
  }
  _onDragOverFile(e: MouseEvent): void {
    e.preventDefault();
    e.stopPropagation();
    this._$fileDrop.addClass('is-dragover');
  }
  _onDragEnterFile(e: MouseEvent): void {
    e.preventDefault();
    e.stopPropagation();
    this._$fileDrop.addClass('is-dragover');
  }
  _onDragLeaveFile(e: MouseEvent): void {
    e.preventDefault();
    e.stopPropagation();
    this._$fileDrop.removeClass('is-dragover');
  }
  _onDropFile(e: MouseEvent): void {
    e.preventDefault();
    e.stopPropagation();
    this._$fileDrop.removeClass('show is-dragover');

    const nativeEvent = (e as unknown as { originalEvent?: DragEvent }).originalEvent ?? (e as unknown as DragEvent);
    const transfer = nativeEvent.dataTransfer as DataTransfer;
    const file = transfer.files[0] as File;
    if (!/\.playlist\.json$/.test(file.name)) {
      return;
    }

    const fileReader = new FileReader();
    fileReader.onload = (ev: ProgressEvent<FileReader>) => {
      window.console.log('file data: ', (ev.target as FileReader).result);
      this.emit('command', 'importFile', (ev.target as FileReader).result);
    };

    fileReader.readAsText(file);
  }
  _onImportFileSelect(e: MouseEvent): void {
    e.preventDefault();

    const nativeEvent = (e as unknown as { originalEvent?: Event }).originalEvent ?? e;
    const target = nativeEvent.target as HTMLInputElement;
    const file = target.files?.[0] as File;
    if (!/\.playlist\.json$/.test(file.name)) {
      return;
    }

    const fileReader = new FileReader();
    fileReader.onload = (ev: ProgressEvent<FileReader>) => {
      window.console.log('file data: ', (ev.target as FileReader).result);
      this.emit('command', 'importFile', (ev.target as FileReader).result);
    };

    fileReader.readAsText(file);
  }

  get hasFocus(): boolean {
    return this._listView.hasFocus;
  }
}
PlayListView.__css__ = `

    .is-playlistEnable .tabSelect.playlist::after {
      content: '▶';
      color: #fff;
      text-shadow: 0 0 8px orange;
    }
    .zenzaScreenMode_sideView .is-playlistEnable .is-notFullscreen .tabSelect.playlist::after  {
      text-shadow: 0 0 8px #336;
    }

    .playlist-container {
      height: 100%;
      overflow: hidden;
      user-select: none;
    }

    .playlist-header {
      height: 32px;
      border-bottom: 1px solid #000;
      background: #333;
      color: #ccc;
      user-select: none;
    }

    .playlist-menu-button {
      display: inline-block;
      cursor: pointer;
      border: 1px solid #333;
      padding: 0px 4px;
      margin: 0 0 0 4px;
      background: #666;
      font-size: 16px;
      line-height: 28px;
      white-space: nowrap;
    }
    .playlist-menu-button:hover {
      border: 1px outset;
    }
    .playlist-menu-button:active {
      border: 1px inset;
    }
    .playlist-menu-button .playlist-menu-icon {
      font-size: 24px;
      line-height: 28px;
    }

    .playlist-container.enable .toggleEnable,
    .playlist-container.loop   .toggleLoop {
      text-shadow: 0 0 6px #f99;
      color: #ff9;
    }
    .playlist-container .toggleLoop icon {
      font-family: STIXGeneral;
    }

    .playlist-container .shuffle {
      font-size: 14px;
    }
    .playlist-container .shuffle::after {
      content: '(´・ω・｀)';
    }
    .playlist-container .shuffle:hover::after {
      content: '(｀・ω・´)';
    }

    .playlist-frame {
      height: calc(100% - 32px);
      transition: opacity 0.3s;
    }
    .shuffle .playlist-frame {
      opacity: 0;
    }

    .playlist-count {
      position: absolute;
      top: 0;
      right: 8px;
      display: inline-block;
      font-size: 14px;
      line-height: 32px;
      cursor: pointer;
    }

    .playlist-count:before {
      content: '▼';
    }
    .playlist-count:hover {
      text-decoration: underline;
    }
    .playlist-menu {
      position: absolute;
      right: 0px;
      top: 24px;
      min-width: 150px;
      background: #333 !important;
    }

    .playlist-menu li {
      line-height: 20px;
      border: none !important;
    }

    .playlist-menu .separator {
      border: 1px inset;
      border-radius: 3px;
      margin: 8px 8px;
    }

    .playlist-file-drop {
      display: none;
      position: absolute;
      width: 94%;
      height: 94%;
      top: 3%;
      left: 3%;
      background: #000;
      color: #ccc;
      opacity: 0.8;
      border: 2px solid #ccc;
      box-shadow: 0 0 4px #fff;
      padding: 16px;
      z-index: 100;
    }

    .playlist-file-drop.show {
      opacity: 0.98 !important;
    }

    .playlist-file-drop.drag-over {
      box-shadow: 0 0 8px #fe9;
      background: #030;
    }

    .playlist-file-drop * {
      pointer-events: none;
    }

    .playlist-file-drop-inner {
      padding: 8px;
      height: 100%;
      border: 1px dotted #888;
    }

    .import-playlist-file-select {
      position: absolute;
      text-indent: -9999px;
      width: 100%;
      height: 20px;
      opacity: 0;
      cursor: pointer;
    }

  `.trim();
PlayListView.__tpl__ = `
    <div class="playlist-container">
      <div class="playlist-header">
        <label class="playlist-menu-button toggleEnable playlist-command"
          data-command="toggleEnable"><icon class="playlist-menu-icon">▶</icon> 連続再生</label>
        <label class="playlist-menu-button toggleLoop playlist-command"
          data-command="toggleLoop"><icon class="playlist-menu-icon">&#8635;</icon> リピート</label>

        <div class="playlist-count playlist-command" data-command="toggleMenu">
          <span class="playlist-index">---</span> / <span class="playlist-length">---</span>
          <div class="zenzaPopupMenu playlist-menu">
            <div class="listInner">
            <ul>
              <li class="playlist-command" data-command="shuffle">
                シャッフル
              </li>
              <li class="playlist-command" data-command="reverse">
                逆順にする
              </li>
              <li class="playlist-command" data-command="sortBy" data-param="postedAt">
                古い順に並べる
              </li>
              <li class="playlist-command" data-command="sortBy" data-param="view:desc">
                再生の多い順に並べる
              </li>
              <li class="playlist-command" data-command="sortBy" data-param="comment:desc">
                コメントの多い順に並べる
              </li>
              <li class="playlist-command" data-command="sortBy" data-param="title">
                タイトル順に並べる
              </li>
              <li class="playlist-command" data-command="sortBy" data-param="duration:desc">
                動画の長い順に並べる
              </li>
              <li class="playlist-command" data-command="sortBy" data-param="duration">
                動画の短い順に並べる
              </li>

              <hr class="separator">
              <li class="playlist-command" data-command="exportFile">ファイルに保存 &#x1F4BE;</li>

              <li class="playlist-command" data-command="importFileMenu">
                <input type="file" class="import-playlist-file-select" accept=".json">
                ファイルから読み込む
              </li>

              <hr class="separator">
              <li class="playlist-command" data-command="resetPlayedItemFlag">すべて未視聴にする</li>
              <li class="playlist-command" data-command="removePlayedItem">視聴済み動画を消す ●</li>
              <li class="playlist-command" data-command="removeNonActiveItem">リストの消去 ×</li>

            </ul>
            </div>
          </div>
        </div>
      </div>
      <div class="playlist-frame"></div>
      <div class="playlist-file-drop">
        <div class="playlist-file-drop-inner">
          ファイルをここにドロップ
        </div>
      </div>
    </div>
  `.trim();

//===END===

export { PlayListView };
