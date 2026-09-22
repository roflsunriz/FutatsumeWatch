import _ from 'lodash';
import { Emitter } from '../../../lib/src/emitter';
import { NicoChatFilter } from './nico-chat-filter';
import type { NicoChatFilterParams } from './nico-chat-filter';
import { NicoChat } from './nico-chat';
import type { NicoChatType, NicoChatData, NicoChatOptions } from './nico-chat';
import { NicoChatGroup } from './nico-chat-group';
import { NicoScripter } from './nico-scripter';
import { textUtil } from '../../../lib/src/text/text-util';

interface NicoCommentParams {
  filter?: unknown;
  nicoChatFilter?: NicoChatFilter;
}

export interface SetChatsOptions {
  append?: unknown;
  duration?: unknown;
  mainThreadId?: unknown;
  format?: unknown;
  replacement?: unknown;
}

interface ThreadCommentData {
  body: unknown;
  postedAt: unknown;
  commands: unknown;
  isPremium: unknown;
  userId: unknown;
  vposMs: unknown;
  isMyPost: unknown;
  nicoruCount: unknown;
}

interface ThreadData {
  comments: ThreadCommentData[];
  info: { fork: unknown; layer: { index: unknown }; label: unknown };
  id: unknown;
}

interface BulkChatData {
  chat?: { content?: unknown; mail?: unknown } | null;
}

interface TextUtilLike {
  escapeRegs(value: string): string;
}

type ChatFactory = (data: NicoChatData, options: NicoChatOptions) => NicoChatType;
//===BEGIN===
const MAX_COMMENT = 10000;

class NicoComment extends Emitter {
  declare _currentTime: number;
  declare _nicoChatFilter: NicoChatFilter;
  declare topGroup: NicoChatGroup;
  declare nakaGroup: NicoChatGroup;
  declare bottomGroup: NicoChatGroup;
  declare nicoScripter: NicoScripter;
  declare _options: SetChatsOptions | undefined;
  declare _duration: number | undefined;
  declare _xml: string;
  declare _wordReplacer: ((text: string) => string) | null;
  static getMaxCommentsByDuration(duration = 6 * 60 * 60 * 1000): number {
    if (duration < 64) {
      return 100;
    }
    if (duration < 300) {
      return 250;
    }
    if (duration < 600) {
      return 500;
    }
    return 1000;
  }

  constructor(params: NicoCommentParams) {
    super();
    this._currentTime = 0;

    params.nicoChatFilter = this._nicoChatFilter = new NicoChatFilter((params.filter as NicoChatFilterParams) || {});
    this._nicoChatFilter.on('change', this._onFilterChange.bind(this));

    const groupParams = { ...params, nicoChatFilter: this._nicoChatFilter };
    this.topGroup = new NicoChatGroup(NicoChat.TYPE.TOP, groupParams);
    this.nakaGroup = new NicoChatGroup(NicoChat.TYPE.NAKA, groupParams);
    this.bottomGroup = new NicoChatGroup(NicoChat.TYPE.BOTTOM, groupParams);

    this.nicoScripter = new NicoScripter();
    this.nicoScripter.on('command', (command: unknown, param: unknown) => this.emit('command', command, param));

    const onChange = _.debounce(this._onChange.bind(this), 100);
    this.topGroup.on('change', onChange);
    this.nakaGroup.on('change', onChange);
    this.bottomGroup.on('change', onChange);

    void this.emitResolve('GetReady!');
  }

  setXml(xml: Document, options: SetChatsOptions): Promise<void> {
    const chatsData = Array.from(xml.getElementsByTagName('chat')).filter((chat) => chat.firstChild);
    return this.setChats(chatsData, options);
  }
  setThreads(data: { threads: ThreadData[] }, options: SetChatsOptions): Promise<void> {
    const chatsData = data.threads.flatMap((thread) => {
      return thread.comments.map((c) => {
        return Object.assign(
          {
            text: c.body,
            date: new Date(c.postedAt as string | number).getTime() / 1000,
            cmd: (c.commands as string[]).join(' '),
            premium: c.isPremium,
            user_id: c.userId,
            vpos: (c.vposMs as number) / 10,
            fork: thread.info.fork,
            isMine: c.isMyPost,
            thread: thread.id,
            nicoru: c.nicoruCount,
            layerId: thread.info.layer.index,
            threadLabel: thread.info.label,
          },
          c
        );
      });
    });
    return this.setChats(chatsData, options);
  }
  async setData(data: BulkChatData[], options: SetChatsOptions): Promise<void> {
    const chatsData = data
      .filter((d) => d.chat)
      .map((d) => {
        const chat = d.chat as { content?: unknown; mail?: unknown };
        return Object.assign({ text: chat.content || '', cmd: chat.mail || '' }, chat);
      });
    return this.setChats(chatsData, options);
  }
  setChats(chatsData: unknown[], options: SetChatsOptions = {}): Promise<void> {
    this._options = options;

    const nicoScripter = this.nicoScripter;
    if (!options.append) {
      this.topGroup.reset();
      this.nakaGroup.reset();
      this.bottomGroup.reset();
      nicoScripter.reset();
    }
    const videoDuration = (this._duration = parseInt((options.duration || 0x7fffff) as string));
    const maxCommentsByDuration = NicoComment.getMaxCommentsByDuration(videoDuration);
    const mainThreadId = options.mainThreadId || 0;
    let nicoChats: NicoChatType[] = [];

    const top: NicoChatType[] = [],
      bottom: NicoChatType[] = [],
      naka: NicoChatType[] = [];
    const create: ChatFactory =
      options.format !== 'xml'
        ? (data, opts) => NicoChat.create(data, opts)
        : (data, opts) => NicoChat.createFromChatElement(data as unknown as Element, opts);
    for (let i = 0, len = Math.min(chatsData.length, MAX_COMMENT); i < len; i++) {
      const chat = chatsData[i] as NicoChatData;

      const nicoChat = create(chat, { videoDuration, mainThreadId });
      if (nicoChat.isDeleted) {
        continue;
      }

      if (nicoChat.isNicoScript) {
        nicoScripter.add(nicoChat);
      }
      nicoChats.push(nicoChat);
    }
    nicoChats = ([] as NicoChatType[])
      .concat(
        ...// fork0 通常のコメント fork1 投稿者コメント fork2 かんたんコメント
        nicoChats
          .filter((c) => ((c as unknown as { isCA?: unknown }).isCA || c.isPatissier) && c.fork !== 1 && c.isSubThread)
          .splice(maxCommentsByDuration)
      )
      .concat(
        ...nicoChats
          .filter((c) => ((c as unknown as { isCA?: unknown }).isCA || c.isPatissier) && c.fork !== 1 && !c.isSubThread)
          .splice(maxCommentsByDuration)
      )
      .concat(
        ...nicoChats.filter((c) => !((c as unknown as { isCA?: unknown }).isCA || c.isPatissier) || c.fork === 1)
      );
    nicoChats.filter((chat) => chat.fork === 2).forEach((chat) => (chat.size = NicoChat.SIZE.SMALL));

    if (_.isObject(options.replacement) && _.size(options.replacement) > 0) {
      this._wordReplacer = this.buildWordReplacer(options.replacement as Record<string, string>);
      this._preProcessWordReplacement(nicoChats, this._wordReplacer);
    } else {
      this._wordReplacer = null;
    }

    if (options.append) {
      nicoChats = nicoChats.filter((chat) => {
        return !this.topGroup.includes(chat) && !this.nakaGroup.includes(chat) && !this.bottomGroup.includes(chat);
      });
    }

    let minTime = Date.now();
    let maxTime = 0;
    for (const c of nicoChats) {
      minTime = Math.min(minTime, c.date as number);
      maxTime = Math.max(maxTime, c.date as number);
    }
    const timeDepth = maxTime - minTime;
    for (const c of nicoChats) {
      const mutable = c as unknown as { time3d: number; time3dp: number };
      mutable.time3d = (c.date as number) - minTime;
      mutable.time3dp = mutable.time3d / timeDepth;
    }

    if (!nicoScripter.isEmpty) {
      nicoScripter.apply(nicoChats);
    }

    const TYPE = NicoChat.TYPE;
    for (const nicoChat of nicoChats) {
      switch (nicoChat.type) {
        case TYPE.TOP:
          top.push(nicoChat);
          break;
        case TYPE.BOTTOM:
          bottom.push(nicoChat);
          break;
        default:
          naka.push(nicoChat);
          break;
      }
    }

    this.topGroup.addChatArray(top);
    this.nakaGroup.addChatArray(naka);
    this.bottomGroup.addChatArray(bottom);

    this.emit('parsed');
    return Promise.resolve();
  }

  /**
   * コメント置換器となる関数を生成
   * なにがやりたかったのやら
   */
  buildWordReplacer(replacement: Record<string, string>): (text: string) => string {
    const textUtilLike = textUtil as unknown as TextUtilLike;
    let func: (text: string) => string = (text) => text;

    const makeFullReplacement = (
      f: (text: string) => string,
      src: string,
      dest: string
    ): ((text: string) => string) => {
      return (text) => f(text.indexOf(src) >= 0 ? dest : text);
    };

    const makeRegReplacement = (f: (text: string) => string, src: string, dest: string): ((text: string) => string) => {
      const reg = new RegExp(textUtilLike.escapeRegs(src), 'g');
      return (text) => f(text.replace(reg, dest));
    };

    for (const key of Object.keys(replacement)) {
      if (!key) {
        continue;
      }
      const val = replacement[key] as string;

      if (key.charAt(0) === '*') {
        func = makeFullReplacement(func, key.substr(1), val);
      } else {
        func = makeRegReplacement(func, key, val);
      }
    }

    return func;
  }
  /**
   * 投稿者が設定したコメント置換フィルタを適用する
   */
  _preProcessWordReplacement(group: NicoChatType[], replacementFunc: (text: string) => string): void {
    for (const nicoChat of group) {
      const text = nicoChat.text;
      const newText = replacementFunc(text);
      if (text !== newText) {
        nicoChat.text = newText;
      }
    }
  }
  get chatList(): { top: NicoChatType[]; naka: NicoChatType[]; bottom: NicoChatType[] } {
    return {
      top: this.topGroup.members,
      naka: this.nakaGroup.members,
      bottom: this.bottomGroup.members,
    };
  }
  get nonFilteredChatList(): { top: NicoChatType[]; naka: NicoChatType[]; bottom: NicoChatType[] } {
    return {
      top: this.topGroup.nonFilteredMembers,
      naka: this.nakaGroup.nonFilteredMembers,
      bottom: this.bottomGroup.nonFilteredMembers,
    };
  }
  addChat(nicoChat: NicoChatType): void {
    if (nicoChat.isDeleted) {
      return;
    }
    const type = nicoChat.type;
    if (this._wordReplacer) {
      nicoChat.text = this._wordReplacer(nicoChat.text);
    }

    if (!this.nicoScripter.isEmpty) {
      this.nicoScripter.apply([nicoChat]);
    }

    let group: NicoChatGroup;
    switch (type) {
      case NicoChat.TYPE.TOP:
        group = this.topGroup;
        break;
      case NicoChat.TYPE.BOTTOM:
        group = this.bottomGroup;
        break;
      default:
        group = this.nakaGroup;
        break;
    }

    group.addChat(nicoChat);
    this.emit('addChat');
  }
  removeChat(nicoChat: NicoChatType): void {
    let group: NicoChatGroup;
    switch (nicoChat.type) {
      case NicoChat.TYPE.TOP:
        group = this.topGroup;
        break;
      case NicoChat.TYPE.BOTTOM:
        group = this.bottomGroup;
        break;
      default:
        group = this.nakaGroup;
        break;
    }

    group.removeChat(nicoChat);
  }
  /**
   * コメントの内容が変化した通知
   * NG設定、フィルタ反映時など
   */
  _onChange(e: unknown): void {
    const ev = (e || {}) as { group?: unknown; chat?: unknown };
    const event = {
      nicoComment: this,
      group: ev.group,
      chat: ev.chat,
    };
    this.emit('change', event);
  }
  _onFilterChange(): void {
    this.emit('filterChange', this._nicoChatFilter);
  }
  clear(): this | undefined {
    this._xml = '';
    this.topGroup.reset();
    this.nakaGroup.reset();
    this.bottomGroup.reset();
    this.emit('clear');
    return this;
  }
  get currentTime(): number {
    return this._currentTime;
  }
  set currentTime(sec: number) {
    this._currentTime = sec;

    this.topGroup.currentTime = sec;
    this.nakaGroup.currentTime = sec;
    this.bottomGroup.currentTime = sec;

    this.nicoScripter.currentTime = sec;

    this.emit('currentTime', sec);
  }
  seek(time: number): void {
    this.currentTime = time;
  }
  set vpos(vpos: number) {
    this.currentTime = vpos / 100;
  }
  getGroup(type: string): NicoChatGroup {
    switch (type) {
      case NicoChat.TYPE.TOP:
        return this.topGroup;
      case NicoChat.TYPE.BOTTOM:
        return this.bottomGroup;
      default:
        return this.nakaGroup;
    }
  }
  /**
   * @returns {NicoChatFilter}
   */
  get filter(): NicoChatFilter {
    return this._nicoChatFilter;
  }
}

//===END===

export { NicoComment };
