//===BEGIN===
/**
 * コメントの最小単位
 *
 */
interface NicoChatData {
  [key: string]: unknown;
}

interface NicoChatProps {
  [key: string]: unknown;
}

interface NicoChatOptions {
  videoDuration?: unknown;
  mainThreadId?: unknown;
  format?: unknown;
}

interface NicoChatGroupLike {
  onChange(args: { chat: unknown }): void;
}

export type { NicoChatData, NicoChatProps, NicoChatOptions };

function NicoChatInitFunc() {
  class NicoChat {
    declare static id: number;
    declare static SIZE: { BIG: string; MEDIUM: string; SMALL: string };
    declare static TYPE: { TOP: string; NAKA: string; BOTTOM: string };
    declare static DURATION: { TOP: number; NAKA: number; BOTTOM: number };
    declare static _CMD_DURATION: RegExp;
    declare static _CMD_REPLACE: RegExp;
    declare static _COLOR_MATCH: RegExp;
    declare static _COLOR_NAME_MATCH: RegExp;
    declare static COLORS: Record<string, string>;
    declare props: NicoChatProps;
    static createBlank(options: NicoChatData = {}) {
      return Object.assign(
        {
          text: '',
          date: '000000000',
          cmd: '',
          premium: false,
          user_id: '0',
          vpos: 0,
          deleted: '',
          color: '#FFFFFF',
          size: NicoChat.SIZE.MEDIUM,
          type: NicoChat.TYPE.NAKA,
          score: 0,
          no: 0,
          fork: 0,
          isInvisible: false,
          isReverse: false,
          isPatissier: false,
          fontCommand: '',
          commentVer: 'flash',
          currentTime: 0,
          hasDurationSet: false,
          isMine: false,
          isUpdating: false,
          isCA: false,
          thread: 0,
          nicoru: 0,
          opacity: 1,
        },
        options
      );
    }

    static create(data: NicoChatData, options: NicoChatOptions = {}): NicoChat {
      return new NicoChat(NicoChat.createBlank(data), options);
    }

    static createFromChatElement(elm: Element, options: NicoChatOptions = {}): NicoChat {
      const data: NicoChatData = {
        text: elm.textContent,
        date: parseInt(elm.getAttribute('date') ?? '', 10) || Math.floor(Date.now() / 1000),
        cmd: elm.getAttribute('mail') || '',
        isPremium: elm.getAttribute('premium') === '1',
        userId: elm.getAttribute('user_id'),
        vpos: parseInt(elm.getAttribute('vpos') ?? '', 10),
        deleted: elm.getAttribute('deleted') === '1',
        isMine: elm.getAttribute('mine') === '1',
        isUpdating: elm.getAttribute('updating') === '1',
        score: parseInt(elm.getAttribute('score') || '0', 10),
        fork: parseInt(elm.getAttribute('fork') || '0', 10),
        leaf: parseInt(elm.getAttribute('leaf') || '-1', 10),
        no: parseInt(elm.getAttribute('no') || '0', 10),
        thread: parseInt(elm.getAttribute('thread') ?? '', 10),
      };
      return new NicoChat(data, options);
    }

    static parseCmd(command: string, isFork = false, props: NicoChatProps = {}): NicoChatProps {
      const tmp = command.toLowerCase().split(/[\x20\xA0\u3000\t\u2003\s]+/);
      const cmd: Record<string, unknown> = {};
      for (const c of tmp) {
        if (NicoChat.COLORS[c]) {
          cmd.COLOR = NicoChat.COLORS[c];
        } else if (NicoChat._COLOR_MATCH.test(c)) {
          cmd.COLOR = c;
        } else if (isFork && NicoChat._CMD_DURATION.test(c)) {
          cmd.duration = RegExp.$1;
        } else {
          cmd[c] = true;
        }
      }

      if (cmd.COLOR) {
        props.color = cmd.COLOR;
        props.hasColorCommand = true;
      }

      if (cmd.big) {
        props.size = NicoChat.SIZE.BIG;
        props.hasSizeCommand = true;
      } else if (cmd.small) {
        props.size = NicoChat.SIZE.SMALL;
        props.hasSizeCommand = true;
      }

      if (cmd.ue) {
        props.type = NicoChat.TYPE.TOP;
        props.duration = NicoChat.DURATION.TOP;
        props.hasTypeCommand = true;
      } else if (cmd.shita) {
        props.type = NicoChat.TYPE.BOTTOM;
        props.duration = NicoChat.DURATION.BOTTOM;
        props.hasTypeCommand = true;
      }

      if (cmd.ender) {
        props.isEnder = true;
      }
      if (cmd.full) {
        props.isFull = true;
      }
      if (cmd.pattisier) {
        props.isPatissier = true;
      }
      if (cmd.ca) {
        props.isCA = true;
      }

      if (cmd.duration) {
        props.hasDurationSet = true;
        props.duration = Math.max(0.01, parseFloat(cmd.duration as string));
      }

      if (cmd.mincho) {
        props.fontCommand = 'mincho';
        props.commentVer = 'html5';
      } else if (cmd.gothic) {
        props.fontCommand = 'gothic';
        props.commentVer = 'html5';
      } else if (cmd.defont) {
        props.fontCommand = 'defont';
        props.commentVer = 'html5';
      }

      if (cmd._live) {
        props.opacity = (props.opacity as number) * 0.5;
      }

      return props;
    }

    static SORT_FUNCTION(a: { vpos: number; uniqNo: number }, b: { vpos: number; uniqNo: number }): number {
      const av = a.vpos,
        bv = b.vpos;
      if (av !== bv) {
        return av - bv;
      } else {
        return a.uniqNo < b.uniqNo ? -1 : 1;
      }
    }

    constructor(data: NicoChatData, options: NicoChatOptions = {}) {
      const opts = Object.assign({ videoDuration: 0x7fffff, mainThreadId: 0, format: '' }, options);
      const props: NicoChatProps = (this.props = {});
      props.id = `chat${NicoChat.id++}`;
      props.currentTime = 0;

      Object.assign(props, data);
      if (opts.format === 'bulk') {
        return;
      }
      props.userId = data.user_id;
      props.fork = (data.fork as number) * 1;
      props.thread = (data.thread as number) * 1;
      props.isPremium = data.premium ? '1' : '0';
      props.isSubThread = opts.mainThreadId && props.thread !== opts.mainThreadId;
      if (typeof data.layerId === 'number') {
        props.layerId = data.layerId;
      } else if ((props.fork as number) > 1) {
        // fork2,fork3を0と同じレイヤーにする対応
        props.layerId = 0;
      } else {
        props.layerId = props.fork;
      }
      props.uniqNo =
        ((data.no as number) % 10000) + (data.fork as number) * 100000 + ((data.thread as number) % 1000000) * 1000000;
      props.color = null;
      props.size = NicoChat.SIZE.MEDIUM;
      props.type = NicoChat.TYPE.NAKA;
      props.duration = NicoChat.DURATION.NAKA;
      props.commentVer = 'flash';
      props.nicoru = data.nicoru || 0;
      props.valhalla = data.valhalla;
      props.lastNicoruDate = data.last_nicoru_date || null;
      props.opacity = 1;

      props.time3d = 0;
      props.time3dp = 0;

      const text = props.text as string;
      if ((props.fork as number) > 0 && text.match(/^[/＠@]/)) {
        props.isNicoScript = true;
        props.isInvisible = true;
      }

      if (props.deleted) {
        return;
      }

      const cmd = props.cmd as string;
      if (cmd.length > 0 && cmd.trim() !== '184') {
        NicoChat.parseCmd(cmd, (props.fork as number) > 0, props);
      }

      // durationを超える位置にあるコメントを詰める vposはセンチ秒なので気をつけ
      const vpos = props.vpos as number;
      const videoDuration = opts.videoDuration;
      const duration = props.duration as number;
      const maxv = props.isNicoScript
        ? Math.min(vpos, videoDuration * 100)
        : Math.min(vpos, (1 + videoDuration - duration) * 100 + Math.random() * 40 - 20);
      const minv = Math.max(maxv, 0);
      props.vpos = minv;
    }

    reset() {
      Object.assign(this.props, {
        text: '',
        date: '000000000',
        cmd: '',
        isPremium: false,
        userId: '',
        vpos: 0,
        deleted: '',
        color: '#FFFFFF',
        size: NicoChat.SIZE.MEDIUM,
        type: NicoChat.TYPE.NAKA,
        isMine: false,
        score: 0,
        no: 0,
        fork: 0,
        isInvisible: false,
        isReverse: false,
        isPatissier: false,
        fontCommand: '',
        commentVer: 'flash',
        nicoru: 0,
        currentTime: 0,
        hasDurationSet: false,
      });
    }
    onChange(): void {
      const group = this.props.group as NicoChatGroupLike | undefined;
      if (group) {
        group.onChange({ chat: this });
      }
    }
    set currentTime(sec: number) {
      this.props.currentTime = sec;
    }
    get currentTime(): number {
      return this.props.currentTime as number;
    }
    set group(group: unknown) {
      this.props.group = group;
    }
    get group(): unknown {
      return this.props.group;
    }
    get isUpdating(): boolean {
      return !!this.props.isUpdating;
    }
    set isUpdating(v: unknown) {
      if (this.props.isUpdating !== v) {
        this.props.isUpdating = !!v;
        if (!v) {
          this.onChange();
        }
      }
    }
    set isPostFail(v: unknown) {
      this.props.isPostFail = v;
    }
    get isPostFail(): boolean {
      return !!this.props.isPostFail;
    }
    get id(): string {
      return this.props.id as string;
    }
    get text(): string {
      return this.props.text as string;
    }
    set text(v: string) {
      this.props.text = v;
      this.props.htmlText = null;
    }
    get htmlText(): string {
      return (this.props.htmlText as string) || '';
    }
    set htmlText(v: string) {
      this.props.htmlText = v;
    }
    get date(): unknown {
      return this.props.date;
    }
    get dateUsec(): unknown {
      return this.props.date_usec;
    }
    get lastNicoruDate(): unknown {
      return this.props.lastNicoruDate;
    }
    get cmd(): string {
      return this.props.cmd as string;
    }
    get isPremium(): boolean {
      return !!this.props.isPremium;
    }
    get isEnder(): boolean {
      return !!this.props.isEnder;
    }
    get isFull(): boolean {
      return !!this.props.isFull;
    }
    get isMine(): boolean {
      return !!this.props.isMine;
    }
    get isInvisible(): boolean {
      return this.props.isInvisible as boolean;
    }
    get isNicoScript(): boolean {
      return this.props.isNicoScript as boolean;
    }
    get isPatissier(): boolean {
      return this.props.isPatissier as boolean;
    }
    get isSubThread(): boolean {
      return this.props.isSubThread as boolean;
    }
    get hasColorCommand(): boolean {
      return !!this.props.hasColorCommand;
    }
    get hasSizeCommand(): boolean {
      return !!this.props.hasSizeCommand;
    }
    get hasTypeCommand(): boolean {
      return !!this.props.hasTypeCommand;
    }
    get duration(): number {
      return this.props.duration as number;
    }
    get hasDurationSet(): boolean {
      return !!this.props.hasDurationSet;
    }
    set duration(v: number) {
      this.props.duration = v;
      this.props.hasDurationSet = true;
    }
    get userId(): unknown {
      return this.props.userId;
    }
    get vpos(): number {
      return this.props.vpos as number;
    }
    get beginTime(): number {
      return this.vpos / 100;
    }
    get isDeleted(): boolean {
      return !!this.props.deleted;
    }
    get color(): string | null {
      return this.props.color as string | null;
    }
    set color(v: string | null) {
      this.props.color = v;
    }
    get size(): string {
      return this.props.size as string;
    }
    set size(v: string) {
      this.props.size = v;
    }
    get type(): string {
      return this.props.type as string;
    }
    set type(v: string) {
      this.props.type = v;
    }
    get score(): number {
      return this.props.score as number;
    }
    get no(): number {
      return this.props.no as number;
    }
    set no(no: number) {
      const props = this.props;
      props.no = no;
      props.uniqNo = (no % 100000) + (props.fork as number) * 1000000 + (props.thread as number) * 10000000;
    }
    get uniqNo(): number {
      return this.props.uniqNo as number;
    }
    get layerId(): number {
      return this.props.layerId as number;
    }
    get leaf(): unknown {
      return this.props.leaf;
    }
    get fork(): number {
      return this.props.fork as number;
    }
    get isReverse(): boolean {
      return this.props.isReverse as boolean;
    }
    set isReverse(v: unknown) {
      this.props.isReverse = !!v;
    }
    get fontCommand(): string {
      return this.props.fontCommand as string;
    }
    get commentVer(): string {
      return this.props.commentVer as string;
    }
    get threadId(): number {
      return this.props.thread as number;
    }
    get threadLabel(): unknown {
      return this.props.threadLabel;
    }
    get nicoru(): number {
      return this.props.nicoru as number;
    }
    set nicoru(v: number) {
      this.props.nicoru = v;
    }
    get nicotta(): boolean {
      return !!this.props.nicotta;
    }
    set nicotta(v: unknown) {
      this.props.nicotta = v;
      // this.onChange();
    }
    get opacity(): number {
      return this.props.opacity as number;
    }
    get valhalla(): number {
      return (this.props.valhalla as number) || 0;
    }
  }
  NicoChat.id = 1000000;

  NicoChat.SIZE = {
    BIG: 'big',
    MEDIUM: 'medium',
    SMALL: 'small',
  };
  NicoChat.TYPE = {
    TOP: 'ue',
    NAKA: 'naka',
    BOTTOM: 'shita',
  };
  NicoChat.DURATION = {
    TOP: 3 - 0.1,
    NAKA: 4,
    BOTTOM: 3 - 0.1,
  };

  NicoChat._CMD_DURATION = /[@＠]([0-9.]+)/;
  NicoChat._CMD_REPLACE = /(ue|shita|sita|big|small|ender|full|[ ])/g;
  NicoChat._COLOR_MATCH = /(#[0-9a-f]+)/i;
  NicoChat._COLOR_NAME_MATCH = /([a-z]+)/i;
  NicoChat.COLORS = {
    red: '#FF0000',
    pink: '#FF8080',
    orange: '#FFC000',
    yellow: '#FFFF00',
    green: '#00FF00',
    cyan: '#00FFFF',
    blue: '#0000FF',
    purple: '#C000FF',
    black: '#000000',

    white2: '#CCCC99',
    niconicowhite: '#CCCC99',
    red2: '#CC0033',
    truered: '#CC0033',
    pink2: '#FF33CC',
    orange2: '#FF6600',
    passionorange: '#FF6600',
    yellow2: '#999900',
    madyellow: '#999900',
    green2: '#00CC66',
    elementalgreen: '#00CC66',
    cyan2: '#00CCCC',
    blue2: '#3399FF',
    marineblue: '#3399FF',
    purple2: '#6633CC',
    nobleviolet: '#6633CC',
    black2: '#666666',
  };
  return NicoChat;
} // worker用
const NicoChat = NicoChatInitFunc();

export type NicoChatType = InstanceType<ReturnType<typeof NicoChatInitFunc>>;
//===END===
export { NicoChat, NicoChatInitFunc };

//   getDuration() {return this.props.duration;}
//   // hasDurationSet () {return !!this.props.hasDurationSet;}
//   setDuration (v) {
//     this.props.duration = v;
//     this.props.hasDurationSet = true;
//   }
//   getUserId() {return this.props.userId;}
//   getVpos() {return this.props.vpos;}
//   getBeginTime() {return this.getVpos() / 100;}
//   setCurrentTime (sec) { this.props.currentTime = sec;}
//   getCurrentTime() { return this.props.currentTime;}
//   setGroup (group) {this.props.group = group;}
//   getId() {return this.props.id;}
//   getText() {return this.props.text;}
//   setText(v) {this.props.text = v;}
//   getDate() {return this.props.date;}
//   getCmd() {return this.props.cmd;}
//   getColor() {return this.props.color;}
//   setColor(v) {this.props.color = v;}
//   getSize() {return this.props.size;}
//   setSize(v) {this.props.size = v;}
//   getType() {return this.props.type;}
//   setType(v) {this.props.type = v;}
//   getScore() {return this.props.score;}
//   getNo() {return this.props.no;}
//   setNo(no) { this.no = no;}

//   getUniqNo() {return this.props.uniqNo;}
//   getLayerId() {return this.props.layerId;}
//   getLeaf() {return this.props.leaf;}
//   getFork() {return this.props.fork;}
//   // isReverse() {return this.props.isReverse;}
//   setIsReverse(v) {this.props.isReverse = !!v;}
//   getFontCommand() {return this.props.fontCommand;}
//   getCommentVer() {return this.props.commentVer;}
//   getThreadId() {return this.props.thread;}
