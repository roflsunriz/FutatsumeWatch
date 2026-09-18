import { Emitter } from '../../../lib/src/Emitter';
import type { AnyEmitter } from '../../../lib/src/Emitter';
import { NicoChat } from './NicoChat';
import type { NicoChatType } from './NicoChat';
import { NicoTextParser } from './NicoTextParser';
import { Config } from '../../../../src/Config';
import { CommentLayer } from './CommentLayer';

interface NicoTextParserLike {
  likeHTML5(text: string): string;
  likeXP(text: string): string;
}

interface ConfigLike {
  props: Record<string, string>;
  onkey(name: string, handler: (value: unknown) => void): void;
}

interface OffscreenTextField {
  setText(text: string): void;
  setFontSizePixel(pixel: number): void;
  setType(type: string, size: string, fontCommand: string, ver: string): void;
  getOriginalWidth(): number;
  getWidth(): number;
  getOriginalHeight(): number;
  getHeight(): number;
}

interface OffscreenHandle {
  getTextField(): OffscreenTextField;
}

interface BulkLayoutData {
  id: string;
  fork: number;
  type: string;
  isOverflow: boolean;
  isInvisible: boolean;
  isFixed: boolean;
  ypos: number;
  slot: number;
  height: number;
  beginLeft: number;
  beginRight: number;
  endLeft: number;
  endRight: number;
  layerId: number;
}

export type { OffscreenHandle, OffscreenTextField, BulkLayoutData };

//===BEGIN===
/**
 * 個別のコメントの表示位置・タイミング計算
 * コメントアート互換は大体こいつにかかっている
 *
 * コメントのサイズ計算まわりが意味不明なコードだらけだが、
 * 仕様書にもない本家のバグを再現しようとするとこうなるので仕方ない。
 * (しかも、これでも全然足りない)
 * 互換性にこだわらないのであれば7割くらいが不要。
 */
class NicoChatViewModel {
  declare static emitter: AnyEmitter;
  declare static FONT: string;
  declare static FONT_SIZE_PIXEL: { BIG: number; MEDIUM: number; SMALL: number };
  declare static FONT_SIZE_PIXEL_VER_HTML5: { BIG: number; MEDIUM: number; SMALL: number };
  declare static LINE_HEIGHT: { BIG: number; MEDIUM: number; SMALL: number };
  declare static CHAT_MARGIN: number;
  declare static BASE_SCALE: number;
  declare static SPEED_RATE: number;
  declare _speedRate: number;
  declare _nicoChat: NicoChatType;
  declare _offScreen: unknown;
  declare _height: number;
  declare _fontSizePixel: number;
  declare _cssLineHeight: number;
  declare _cssScaleY: number;
  declare _isOverflow: boolean;
  declare _duration: number;
  declare _isFixed: boolean;
  declare _scale: number;
  declare _y: number;
  declare _slot: number;
  declare _type: string;
  declare _size: string;
  declare _beginLeftTiming: number;
  declare _endRightTiming: number;
  declare _isLayouted: boolean;
  declare _htmlText: string;
  declare _text: string;
  declare _originalWidth: number;
  declare _width: number;
  declare _originalHeight: number;
  declare _speed: number;
  declare _endLeftTiming: number;
  declare _beginRightTiming: number;
  declare _isLineResized: boolean;
  declare _isDoubleResized: boolean | undefined;
  static create(nicoChat: NicoChatType, offScreen: unknown): NicoChatViewModel {
    if (nicoChat.commentVer === 'html5') {
      return new HTML5NicoChatViewModel(nicoChat, offScreen);
    }
    return new FlashNicoChatViewModel(nicoChat, offScreen);
  }

  constructor(nicoChat: NicoChatType, offScreen: unknown) {
    this._speedRate = NicoChatViewModel.SPEED_RATE;

    this.initialize(nicoChat, offScreen);

    if (this._height >= CommentLayer.SCREEN.HEIGHT - this._fontSizePixel / 2) {
      this._isOverflow = true;
    }
    // // line-height は小数点以下切り捨てっぽいのでscaleYで補正する
    const cssLineHeight = this._cssLineHeight;
    this._cssScaleY = cssLineHeight / Math.floor(cssLineHeight);
    this._cssLineHeight = Math.floor(cssLineHeight);

    if (this._isOverflow || nicoChat.isInvisible) {
      this.checkCollision = () => {
        return false;
      };
    }
  }

  initialize(nicoChat: NicoChatType, offScreen: unknown): void {
    this._nicoChat = nicoChat;
    this._offScreen = offScreen;

    // 画面からはみ出したかどうか(段幕時)
    this._isOverflow = false;
    // 表示時間
    this._duration = nicoChat.duration;

    // 固定されたコメントか、流れるコメントか
    this._isFixed = false;

    this._scale = NicoChatViewModel.BASE_SCALE;
    this._cssLineHeight = 29;
    this._cssScaleY = 1;
    this._y = 0;
    this._slot = -1;

    this.setType(nicoChat.type);

    // ここでbeginLeftTiming, endRightTimingが確定する
    this.setVpos(nicoChat.vpos);

    this.setSize(nicoChat.size, nicoChat.commentVer);

    this._isLayouted = false;

    // 文字を設定
    // この時点で字幕の大きさが確定するので、
    // Z座標・beginRightTiming, endLeftTimingまでが確定する
    this.setText(nicoChat.text, nicoChat.htmlText);

    if (this._isFixed) {
      this._setupFixedMode();
    } else {
      this._setupMarqueeMode();
    }
  }

  setType(type: string): void {
    this._type = type;
    switch (type) {
      case NicoChat.TYPE.TOP:
        this._isFixed = true;
        break;
      case NicoChat.TYPE.BOTTOM:
        this._isFixed = true;
        break;
    }
  }

  setVpos(vpos: number): void {
    switch (this._type) {
      case NicoChat.TYPE.TOP:
        this._beginLeftTiming = vpos / 100;
        break;
      case NicoChat.TYPE.BOTTOM:
        this._beginLeftTiming = vpos / 100;
        break;
      default:
        this._beginLeftTiming = vpos / 100 - 1;
        break;
    }
    this._endRightTiming = this._beginLeftTiming + this._duration;
  }

  setSize(size: string, _commentVer?: unknown): void {
    this._size = size;
    const SIZE_PIXEL =
      this._nicoChat.commentVer === 'html5'
        ? NicoChatViewModel.FONT_SIZE_PIXEL_VER_HTML5
        : NicoChatViewModel.FONT_SIZE_PIXEL;
    switch (size) {
      case NicoChat.SIZE.BIG:
        this._fontSizePixel = SIZE_PIXEL.BIG;
        break;
      case NicoChat.SIZE.SMALL:
        this._fontSizePixel = SIZE_PIXEL.SMALL;
        break;
      default:
        this._fontSizePixel = SIZE_PIXEL.MEDIUM;
        break;
    }
  }

  setText(text: string, parsedHtmlText = ''): void {
    const fontCommand = this.fontCommand;
    const commentVer = this.commentVer;
    const textParser = NicoTextParser as unknown as NicoTextParserLike;
    const htmlText = parsedHtmlText || (commentVer === 'html5' ? textParser.likeHTML5(text) : textParser.likeXP(text));

    this._htmlText = htmlText;
    this._text = text;

    const field = (this._offScreen as OffscreenHandle).getTextField();
    field.setText(htmlText);
    field.setFontSizePixel(this._fontSizePixel);
    field.setType(this._type, this._size, fontCommand, this.commentVer);

    this._originalWidth = field.getOriginalWidth();
    this._width = this._originalWidth * this._scale;
    this._originalHeight = field.getOriginalHeight();
    this._height = this._calculateHeight({});

    // Chrome59で起こる謎の現象。一度ローカル変数に落とすと直る
    // w を使わずにspwを計算するとNaNになる。謎
    const w = this._width;
    const duration = this._duration / this._speedRate;
    if (!this._isFixed) {
      // 流れるコメント (naka)
      const speed = (this._speed = (w + CommentLayer.SCREEN.WIDTH) / duration);
      const spw = w / speed;
      this._endLeftTiming = this._endRightTiming - spw;
      this._beginRightTiming = this._beginLeftTiming + spw;
    } else {
      // ue shita などの固定コメント
      this._speed = 0;
      this._endLeftTiming = this._endRightTiming;
      this._beginRightTiming = this._beginLeftTiming;
    }
  }

  recalcBeginEndTiming(speedRate = 1): void {
    const width = this._width;
    const duration = this._duration / speedRate;
    this._endRightTiming = this._beginLeftTiming + duration;
    this._speedRate = speedRate;
    if (isNaN(width)) {
      return;
    }
    if (!this._isFixed) {
      const speed = (this._speed = (width + CommentLayer.SCREEN.WIDTH) / duration);
      const spw = width / speed;
      this._endLeftTiming = this._endRightTiming - spw;
      this._beginRightTiming = this._beginLeftTiming + spw;
    } else {
      this._speed = 0;
      this._endLeftTiming = this._endRightTiming;
      this._beginRightTiming = this._beginLeftTiming;
    }
  }

  _calcLineHeight({ size, scale = 1 }: { size: string; scale?: number; lc?: number }): number {
    const SIZE = NicoChat.SIZE;
    const MARGIN = 5;
    //const TABLE_HEIGHT = 385;
    // scale *= NicoChatViewModel.BASE_SCALE;
    let lineHeight;
    if (scale >= 0.75) {
      switch (size) {
        case SIZE.BIG:
          lineHeight = (50 - MARGIN * scale) * NicoChatViewModel.BASE_SCALE;
          break;
        case SIZE.SMALL:
          lineHeight = (23 - MARGIN * scale) * NicoChatViewModel.BASE_SCALE;
          break;
        default:
          lineHeight = (34 - MARGIN * scale) * NicoChatViewModel.BASE_SCALE;
          break;
      }
    } else {
      switch (size) {
        case SIZE.BIG:
          lineHeight = ((387 - MARGIN * scale * 0.5) / 16) * NicoChatViewModel.BASE_SCALE;
          break;
        case SIZE.SMALL:
          lineHeight = ((383 - MARGIN * scale * 0.5) / 38) * NicoChatViewModel.BASE_SCALE;
          break;
        default:
          lineHeight = ((378 - MARGIN * scale * 0.5) / 25) * NicoChatViewModel.BASE_SCALE;
      }
    }
    return lineHeight;
  }

  _calcDoubleResizedLineHeight({
    lc = 1,
    cssScale,
    size = NicoChat.SIZE.BIG,
  }: {
    lc?: number;
    cssScale?: unknown;
    size?: string;
  }): number {
    const MARGIN = 5;
    // ニコスクリプトだとBIG以外の二重リサイズもあり得る?
    if (size !== NicoChat.SIZE.BIG) {
      return (size === NicoChat.SIZE.MEDIUM ? 24 : 13) + MARGIN;
    }
    // @see https://www37.atwiki.jp/commentart/pages/20.html
    const scaleValue = typeof cssScale === 'number' ? cssScale : this.cssScale;
    // 本当は行数ではなく縮小率から計算すべきなのだろうけど
    let lineHeight;
    if (lc <= 9) {
      lineHeight = (392 / scaleValue - MARGIN) / lc - 1;
      // lineHeight = ((392 - MARGIN * cssScale) / cssScale) / lc -1;
    } else if (lc <= 10) {
      lineHeight = (384 / scaleValue - MARGIN) / lc - 1;
    } else if (lc <= 11) {
      lineHeight = (389 / scaleValue - MARGIN) / lc - 1;
    } else if (lc <= 12) {
      lineHeight = (388 / scaleValue - MARGIN) / lc - 1;
    } else if (lc <= 13) {
      lineHeight = (381 / scaleValue - MARGIN) / lc - 1;
    } else {
      lineHeight = (381 / scaleValue - MARGIN) / 14;
    }
    return lineHeight;
  }

  /**
   * 高さ計算。
   * 改行リサイズなどが起こる場合はそれを反映した結果の高さを返す
   * Flashのほうはだんだん計算を諦めていく
   */
  _calculateHeight({
    scale = 1,
    lc = 0,
    size,
    isEnder,
    isDoubleResized,
  }: {
    scale?: number;
    lc?: number;
    size?: string;
    isEnder?: unknown;
    isDoubleResized?: unknown;
  }): number {
    lc = lc || this.lineCount;
    isEnder = typeof isEnder === 'boolean' ? isEnder : this._nicoChat.isEnder;
    isDoubleResized = typeof isDoubleResized === 'boolean' ? isDoubleResized : this.isDoubleResized;
    size = size || this._size;
    const MARGIN = 5;
    const TABLE_HEIGHT = 385;
    // const isBaseScaled = NicoChatViewModel.BASE_SCALE !== 1.0;
    let lineHeight;
    // scale *= NicoChatViewModel.BASE_SCALE;
    if (isDoubleResized) {
      this._cssLineHeight = this._calcDoubleResizedLineHeight({ lc, size });
      return ((this._cssLineHeight - MARGIN) * lc * scale * 0.5 + MARGIN - 1) * NicoChatViewModel.BASE_SCALE;
    }

    lineHeight = this._calcLineHeight({ lc, size, scale });
    this._cssLineHeight = lineHeight;
    const height = (lineHeight * lc + MARGIN) * scale;
    if (lc === 1) {
      this._isLineResized = false;
      return height - 1;
    }

    if (isEnder || height < TABLE_HEIGHT / 3) {
      this._isLineResized = false;
      return height - 1;
    }
    // 非enderで画面の高さの1/3を超える時は改行リサイズ
    this._isLineResized = true;
    lineHeight = this._calcLineHeight({ lc, size, scale: scale * 0.5 });
    this._cssLineHeight = lineHeight * 2 - 1;
    return (lineHeight * lc + MARGIN) * scale - 1;
  }

  _setupFixedMode(): void {
    const nicoChat = this._nicoChat;
    const SCREEN = CommentLayer.SCREEN;
    const ver = nicoChat.commentVer;
    const fullWidth = ver === 'html5' ? SCREEN.WIDTH_FULL_INNER_HTML5 : SCREEN.WIDTH_FULL_INNER;
    let screenWidth = nicoChat.isFull ? fullWidth : SCREEN.WIDTH_INNER;
    const screenHeight = CommentLayer.SCREEN.HEIGHT;

    let width = this._width;
    if (this._isLineResized) {
      width = ver === 'html5' ? Math.floor(width * 0.5 - 8) : width * 0.5 + 4 * 0.5;
    }

    const isOverflowWidth = width > screenWidth;

    // 臨界幅リサイズ
    // 画面幅よりデカい場合の調整
    if (isOverflowWidth) {
      // 改行リサイズかつ臨界幅リサイズが起こるとき、基準が 画面幅 * 2 になる
      // Flash時代のバグ由来の仕様
      if (this._isLineResized) {
        screenWidth *= 2;
        this._isDoubleResized = true;
      }
      this._setScale(screenWidth / width);
    } else {
      this._setScale(1);
    }

    // BOTTOMの時だけy座標を画面の下端に合わせる
    // 内部的には0 originで表示の際に下から詰むだけでもいいような気がしてきた。
    if (this._type === NicoChat.TYPE.BOTTOM) {
      this._y = screenHeight - this._height;
    }
  }

  /**
   *  流れる文字のモード
   */
  _setupMarqueeMode(): void {
    if (this._isLineResized) {
      const duration = this._duration / this._speedRate;
      this._setScale(this._scale);
      const speed = (this._speed = (this._width + CommentLayer.SCREEN.WIDTH) / duration);
      this._endLeftTiming = this._endRightTiming - this._width / speed;
      this._beginRightTiming = this._beginLeftTiming + this._width / speed;
    }
  }

  _setScale(scale: number): void {
    this._scale = scale;
    const lsscale = scale * (this._isLineResized ? 0.5 : 1);
    this._height = this._calculateHeight({ isDoubleResized: this.isDoubleResized }) * scale;
    this._width = this._originalWidth * lsscale;
  }

  get bulkLayoutData(): BulkLayoutData {
    return {
      id: this.id,
      fork: this.fork,
      type: this.type,
      isOverflow: this._isOverflow,
      isInvisible: this.isInvisible,
      isFixed: this.isFixed,
      ypos: this.ypos,
      slot: this.slot,
      height: this.height,
      beginLeft: this.beginLeftTiming,
      beginRight: this.beginRightTiming,
      endLeft: this.endLeftTiming,
      endRight: this.endRightTiming,
      layerId: this.layerId,
    };
  }

  set bulkLayoutData(data: BulkLayoutData) {
    this.isOverflow = data.isOverflow;
    this._y = data.ypos;
    this._isLayouted = true;
  }

  reset(): void {}

  get lineCount(): number {
    return (this._htmlText || '').split('<br>').length;
  }

  get id(): string {
    return this._nicoChat.id;
  }
  get text(): string {
    return this._text;
  }
  get htmlText(): string {
    return this._htmlText;
  }
  set isLayouted(v: boolean) {
    this._isLayouted = v;
  }
  get isInView(): boolean {
    return this.isInViewBySecond(this.currentTime);
  }

  isInViewBySecond(sec: number): boolean {
    if (!this._isLayouted || sec + 1 /* margin */ < this._beginLeftTiming) {
      return false;
    }
    if (sec > this._endRightTiming) {
      return false;
    }
    if (this.isInvisible) {
      return false;
    }
    return true;
  }

  get isOverflow(): boolean {
    return this._isOverflow;
  }
  set isOverflow(v: boolean) {
    this._isOverflow = v;
  }
  get isInvisible(): boolean {
    return this._nicoChat.isInvisible;
  }
  get width(): number {
    return this._width;
  }
  get height(): number {
    return this._height;
  }
  get duration(): number {
    return this._duration / this._speedRate;
  }
  get speed(): number {
    return this._speed;
  }

  get inviewTiming(): number {
    return this._beginLeftTiming;
  }
  // 左端が見えるようになるタイミング(4:3規準)
  get beginLeftTiming(): number {
    return this._beginLeftTiming;
  }
  // 右端が見えるようになるタイミング(4:3規準)
  get beginRightTiming(): number {
    return this._beginRightTiming;
  }
  // 左端が見えなくなるタイミング(4:3規準)
  get endLeftTiming(): number {
    return this._endLeftTiming;
  }
  // 右端が見えなくなるタイミング(4:3規準)
  get endRightTiming(): number {
    return this._endRightTiming;
  }
  get vpos(): number {
    return this._nicoChat.vpos;
  }
  get xpos(): number {
    return this.getXposBySecond(this.currentTime);
  }
  get ypos(): number {
    return this._y;
  }
  set ypos(v: number) {
    this._y = v;
  }
  get slot(): number {
    return this._slot;
  }
  set slot(v: number) {
    this._slot = v;
  }
  get color(): string | null {
    return this._nicoChat.color;
  }
  get size(): string {
    return this._nicoChat.size;
  }
  get type(): string {
    return this._nicoChat.type;
  }
  get cssScale(): number {
    return this._scale * (this._isLineResized ? 0.5 : 1);
  }
  get fontSizePixel(): number {
    return this._fontSizePixel;
  }
  get lineHeight(): number {
    return this._cssLineHeight;
  }
  get isLineResized(): boolean {
    return this._isLineResized;
  }
  get isDoubleResized(): boolean | undefined {
    return this._isDoubleResized;
  }
  get no(): number {
    return this._nicoChat.no;
  }
  get uniqNo(): number {
    return this._nicoChat.uniqNo;
  }
  get layerId(): number {
    return this._nicoChat.layerId;
  }
  get fork(): number {
    return this._nicoChat.fork;
  }
  get nicoru(): number {
    return this._nicoChat.nicoru;
  }
  get nicotta(): boolean {
    return this._nicoChat.nicotta;
  }
  /**
   * second時の左端座標を返す
   */
  getXposBySecond(sec: number): number {
    if (this._isFixed) {
      return (CommentLayer.SCREEN.WIDTH - this._width) / 2;
    } else {
      const diff = sec - this._beginLeftTiming;
      return CommentLayer.SCREEN.WIDTH + diff * this._speed;
    }
  }
  getXposByVpos(vpos: number): number {
    return this.getXposBySecond(vpos / 100);
  }
  get currentTime(): number {
    return this._nicoChat.currentTime;
  }
  get isFull(): boolean {
    return this._nicoChat.isFull;
  }
  get isFixed(): boolean {
    return this._isFixed;
  }
  get isNicoScript(): boolean {
    return this._nicoChat.isNicoScript;
  }
  get isMine(): boolean {
    return this._nicoChat.isMine;
  }
  get isUpdating(): boolean {
    return this._nicoChat.isUpdating;
  }
  get isPostFail(): boolean {
    return this._nicoChat.isPostFail;
  }
  get isReverse(): boolean {
    return this._nicoChat.isReverse;
  }
  get isSubThread(): boolean {
    return this._nicoChat.isSubThread;
  }
  get fontCommand(): string {
    return this._nicoChat.fontCommand;
  }
  get commentVer(): string {
    return this._nicoChat.commentVer;
  }

  get cssScaleY(): number {
    return this.cssScale * this._cssScaleY;
  }

  get meta() {
    // debug用
    return JSON.stringify({
      width: this.width,
      height: this.height,
      scale: this.cssScale,
      cmd: this._nicoChat.cmd,
      fontSize: this.fontSizePixel,
      vpos: this.vpos,
      xpos: this.xpos,
      ypos: this.ypos,
      slot: this.slot,
      type: this.type,
      begin: this.beginLeftTiming,
      end: this.endRightTiming,
      speed: this.speed,
      color: this.color,
      size: this.size,
      duration: this.duration,
      opacity: this.opacity,

      ender: this._nicoChat.isEnder,
      full: this._nicoChat.isFull,
      no: this._nicoChat.no,
      uniqNo: this._nicoChat.uniqNo,
      score: this._nicoChat.score,
      userId: this._nicoChat.userId,
      date: this._nicoChat.date,
      fork: this._nicoChat.fork,
      layerId: this._nicoChat.layerId,
      ver: this._nicoChat.commentVer,
      lc: this.lineCount,
      ls: this.isLineResized,
      thread: this._nicoChat.threadId,
      isSub: this._nicoChat.isSubThread,
      text: this.text,
    });
  }

  /**
   * コメント同士の衝突を判定
   *
   * @param {NicoChatViewModel} target
   * @return boolean
   */
  checkCollision(target: NicoChatViewModel): boolean {
    // 一度はみ出した文字は当たり判定を持たない
    if (this.isOverflow || target.isOverflow || target.isInvisible) {
      return false;
    }

    if (this.layerId !== target.layerId) {
      return false;
    }

    // Y座標が合わないなら絶対衝突しない
    const targetY = target.ypos;
    const selfY = this.ypos;
    if (targetY + target.height < selfY || targetY > selfY + this.height) {
      return false;
    }

    // ターゲットと自分、どっちが右でどっちが左か？の判定
    const leftFirst = this.beginLeftTiming <= target.beginLeftTiming;
    const lt: NicoChatViewModel = leftFirst ? this : target;
    const rt: NicoChatViewModel = leftFirst ? target : this;

    if (this.isFixed) {
      // 左にあるやつの終了より右にあるやつの開始が早いなら、衝突する
      // > か >= で挙動が変わるCAがあったりして正解がわからない
      if (lt.endRightTiming > rt.beginLeftTiming) {
        return true;
      }
    } else {
      // 左にあるやつの右端開始よりも右にあるやつの左端開始のほうが早いなら、衝突する
      if (lt.beginRightTiming >= rt.beginLeftTiming) {
        return true;
      }

      // 左にあるやつの右端終了よりも右にあるやつの左端終了のほうが早いなら、衝突する
      if (lt.endRightTiming >= rt.endLeftTiming) {
        return true;
      }
    }

    return false;
  }

  /**
   * (衝突判定に引っかかったので)自分自身を一段ずらす.
   *
   * @param {NicoChatViewModel} others 示談相手
   */
  moveToNextLine(others: NicoChatViewModel): void {
    const margin = 1; //NicoChatViewModel.CHAT_MARGIN;
    const othersHeight = others.height + margin;
    // 本来はちょっとでもオーバーしたらランダムすべきだが、
    // 本家とまったく同じサイズ計算は難しいのでマージンを入れる
    // コメントアートの再現という点では有効な妥協案
    // コメントアートの再現という点では有効な妥協案
    const overflowMargin = 10;
    const rnd = Math.max(0, CommentLayer.SCREEN.HEIGHT - this.height);
    const yMax = CommentLayer.SCREEN.HEIGHT - this.height + overflowMargin;
    const yMin = 0 - overflowMargin;

    const type = this.type;
    let ypos = this.ypos;

    if (type !== NicoChat.TYPE.BOTTOM) {
      ypos += othersHeight;
      // 画面内に入りきらなかったらランダム配置
      if (ypos > yMax) {
        this.isOverflow = true;
      }
    } else {
      ypos -= othersHeight;
      // 画面内に入りきらなかったらランダム配置
      if (ypos < yMin) {
        this.isOverflow = true;
      }
    }

    this.ypos = this.isOverflow ? Math.floor(Math.random() * rnd) : ypos;
  }

  get time3d(): unknown {
    return (this._nicoChat as unknown as { time3d?: unknown }).time3d;
  }
  get time3dp(): unknown {
    return (this._nicoChat as unknown as { time3dp?: unknown }).time3dp;
  }
  get opacity(): number {
    return this._nicoChat.opacity;
  }
}
NicoChatViewModel.emitter = new Emitter();

NicoChatViewModel.FONT = "'ＭＳ Ｐゴシック'"; // &#xe7cd;
NicoChatViewModel.FONT_SIZE_PIXEL = {
  BIG: 39, // 39
  MEDIUM: 24,
  SMALL: 16, //15
};
NicoChatViewModel.FONT_SIZE_PIXEL_VER_HTML5 = {
  BIG: 40 - 1, // 684 / 17 > x > 684 / 18
  MEDIUM: 27 - 1, // 684 / 25 > x > 684 / 26
  SMALL: 18.4 - 1, // 684 / 37 > x > 684 / 38
};

NicoChatViewModel.LINE_HEIGHT = {
  BIG: 45,
  MEDIUM: 29,
  SMALL: 18,
};

NicoChatViewModel.CHAT_MARGIN = 5;

NicoChatViewModel.BASE_SCALE = parseFloat((Config as unknown as ConfigLike).props.baseChatScale as string);
(Config as unknown as ConfigLike).onkey('baseChatScale', (scale: unknown) => {
  if (isNaN(scale as number)) {
    return;
  }
  const parsed = parseFloat(scale as string);
  NicoChatViewModel.BASE_SCALE = parsed;
  NicoChatViewModel.emitter.emit('updateBaseChatScale', parsed);
});

NicoChatViewModel.SPEED_RATE = 1.0;

class FlashNicoChatViewModel extends NicoChatViewModel {}

class HTML5NicoChatViewModel extends NicoChatViewModel {
  _calculateHeight({
    scale = 1,
    lc = 0,
    size,
    isEnder /*, isDoubleResized*/,
  }: {
    scale?: number;
    lc?: number;
    size?: string;
    isEnder?: unknown;
  }): number {
    lc = lc || this.lineCount;
    isEnder = typeof isEnder === 'boolean' ? isEnder : this._nicoChat.isEnder;
    // isDoubleResized = typeof isDoubleResized === 'boolean' ? isDoubleResized : this.isDoubleResized();
    size = size || this._size;
    const SIZE = NicoChat.SIZE;
    const MARGIN = 4;
    const SCREEN_HEIGHT = CommentLayer.SCREEN.HEIGHT;
    const INNER_HEIGHT = SCREEN_HEIGHT - MARGIN;
    const TABLE_HEIGHT = 360 - MARGIN;
    // 参考データは縦360での計測なので補正する比率
    const RATIO = INNER_HEIGHT / TABLE_HEIGHT;
    scale *= RATIO;
    // scale *= NicoChatViewModel.BASE_SCALE;

    this._isLineResized = false;
    let lineHeight: number;
    // @see https://ch.nicovideo.jp/883797/blomaga/ar1149544
    switch (size) {
      case SIZE.BIG:
        lineHeight = 47;
        break;
      case SIZE.SMALL:
        lineHeight = 22;
        break;
      default:
        lineHeight = 32;
        break;
    }

    this._cssLineHeight = lineHeight;
    if (lc === 1) {
      return (lineHeight * scale - 1) * NicoChatViewModel.BASE_SCALE;
    }
    switch (size) {
      case SIZE.BIG:
        lineHeight = TABLE_HEIGHT / (8 * (TABLE_HEIGHT / 340));
        break;
      case SIZE.SMALL:
        lineHeight = TABLE_HEIGHT / (21 * (TABLE_HEIGHT / 354));
        break;
      default:
        lineHeight = TABLE_HEIGHT / (13 * (TABLE_HEIGHT / 357));
        break;
    }
    const height = (lineHeight * lc + MARGIN) * scale * NicoChatViewModel.BASE_SCALE;
    if (isEnder || height < TABLE_HEIGHT / 3) {
      this._cssLineHeight = lineHeight;
      return height - 1;
    }
    // 非enderで画面の高さの1/3を超える時は改行リサイズ
    this._isLineResized = true;
    switch (size) {
      case SIZE.BIG:
        lineHeight = TABLE_HEIGHT / 16;
        break;
      case SIZE.SMALL:
        lineHeight = TABLE_HEIGHT / 38;
        break;
      default:
        lineHeight = TABLE_HEIGHT / (25 * (TABLE_HEIGHT / 351));
    }
    this._cssLineHeight = lineHeight * 2;
    return ((lineHeight * lc + MARGIN) * scale - 1) * NicoChatViewModel.BASE_SCALE;
  }

  _setScale_(scale: number): void {
    this._scale = scale;
    this._height = this._calculateHeight({}) * scale;
    this._width = this._originalWidth * scale * (this._isLineResized ? 0.5 : 1);
  }

  getCssScaleY(): number {
    return this.cssScale;
  }
}

//===END===
export { NicoChatViewModel };
