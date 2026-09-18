import { cssUtil } from '../../../lib/src/css/css';
import { uQuery } from '../../../lib/src/uQuery';
import { global } from '../../../../src/ZenzaWatchIndex';
import { StoryboardWorker } from './StoryboardWorker';
import { ClassList } from '../../../lib/src/dom/ClassListWrapper';

interface SeekBarThumbnailParams {
  container?: Element | null;
  scale?: unknown;
  storyboard: {
    on(name: string, handler: (...args: never[]) => void): void;
  };
}

interface StoryboardModelLike {
  isAvailable: boolean;
  rawData: unknown;
  cellWidth: number;
  cellHeight: number;
}

interface CssUtilLike {
  addStyle(css: string, id?: string): void;
}

interface UQueryStatic {
  html(html: string): Element[];
}

interface ClassListWrapper {
  contains(name: string): boolean;
  add(name: string): void;
  remove(name: string): void;
}

interface ClassListFactory {
  (view: Element): ClassListWrapper;
}

interface ThumbnailLike {
  setInfo(data: unknown): void;
  currentTime: number;
}

interface StoryboardWorkerLike {
  createThumbnail(params: {
    container: Element | null;
    canvas: Element | null;
    info: unknown;
    name: string;
  }): ThumbnailLike;
}

interface GlobalDebugLike {
  debug: Record<string, unknown>;
}
//===BEGIN===
class SeekBarThumbnail {
  declare static BASE_WIDTH: number;
  declare static BASE_HEIGHT: number;
  declare static __tpl__: string;
  declare static __css__: string;
  declare static styleAdded: boolean;
  declare _container: Element | null | undefined;
  declare _scale: number;
  declare _currentTime: number;
  declare _model: StoryboardModelLike | undefined;
  declare _view: Element | undefined;
  declare classList: ClassListWrapper;
  declare thumbnail: ThumbnailLike | undefined;
  declare isAvailable: boolean;
  constructor(params: SeekBarThumbnailParams) {
    this._container = params.container;
    this._scale = _.isNumber(params.scale) ? params.scale : 1.0;
    this._currentTime = 0;

    params.storyboard.on('reset', this._onStoryboardReset.bind(this));
    params.storyboard.on('update', this._onStoryboardUpdate.bind(this));

    (global as unknown as GlobalDebugLike).debug.seekBarThumbnail = this;
  }
  _onStoryboardUpdate(model: StoryboardModelLike): void {
    this._model = model;
    if (!model.isAvailable) {
      this.isAvailable = false;
      this.hide();
      return;
    }

    if (this.thumbnail) {
      this.thumbnail.setInfo(model.rawData);
    } else {
      this.initializeView(model);
    }
    // this.thumbnail.resize({width: model.cellWidth, height: model.cellHeight});

    this.isAvailable = true;
    this.show();
  }
  _onStoryboardReset(): void {
    this.hide();
  }
  get isVisible(): boolean {
    return this._view ? this.classList.contains('is-visible') : false;
  }
  show(): void {
    if (!this._view) {
      return;
    }
    this.classList.add('is-visible');
  }
  hide(): void {
    if (!this._view) {
      return;
    }
    this.classList.remove('is-visible');
  }
  initializeView(model: StoryboardModelLike): void {
    if (this.thumbnail) {
      return;
    }

    const css = cssUtil as unknown as CssUtilLike;
    if (!SeekBarThumbnail.styleAdded) {
      css.addStyle(SeekBarThumbnail.__css__);
      SeekBarThumbnail.styleAdded = true;
    }
    const query = uQuery as unknown as UQueryStatic;
    const classListFactory = ClassList as unknown as ClassListFactory;
    const worker = StoryboardWorker as unknown as StoryboardWorkerLike;
    const view = (this._view = query.html(SeekBarThumbnail.__tpl__)[0] as Element);
    this.classList = classListFactory(view);

    this.thumbnail = worker.createThumbnail({
      container: view.querySelector('.zenzaSeekThumbnail-image'),
      canvas: view.querySelector('.zenzaSeekThumbnail-thumbnail'),
      info: model.rawData,
      name: 'StoryboardThumbnail',
    });

    if (this._container) {
      this._container.append(view);
    }
  }
  set currentTime(sec: number) {
    this._currentTime = sec;
    if (!this.isAvailable || !this.thumbnail) {
      return;
    }
    this.thumbnail.currentTime = sec;
  }
}
SeekBarThumbnail.BASE_WIDTH = 160;
SeekBarThumbnail.BASE_HEIGHT = 90;

SeekBarThumbnail.__tpl__ = `
  <div class="zenzaSeekThumbnail">
    <div class="zenzaSeekThumbnail-image"><canvas width="160" height="90" class="zenzaSeekThumbnail-thumbnail"></canvas></div>
  </div>
`.trim();

SeekBarThumbnail.__css__ = `
  .is-error .zenzaSeekThumbnail,
  .is-loading .zenzaSeekThumbnail {
    display: none !important;
  }

  .zenzaSeekThumbnail {
    display: none;
    pointer-events: none;
  }

  .zenzaSeekThumbnail-image {
    width: 160px;
    height: 90px;
    opacity: 0.8;
    margin: auto;
    background: #999;
  }

  .enableCommentPreview .zenzaSeekThumbnail {
    width: 100%;
    height: 100%;
    display: none !important;
  }

  .zenzaSeekThumbnail.is-visible {
    display: block;
    overflow: hidden;
    box-sizing: border-box;
    background: rgba(0, 0, 0, 0.3);
    margin: 0 auto 4px;
    z-index: 100;
  }
`.trim();

//===END===

export { SeekBarThumbnail };
