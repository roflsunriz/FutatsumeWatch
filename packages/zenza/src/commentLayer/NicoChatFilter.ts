import { Emitter } from '../../../lib/src/Emitter';
import { textUtil } from '../../../lib/src/text/textUtil';
import { Config } from '../../../../src/Config';
import type { NicoChatType as NicoChat } from './NicoChat';

export interface NicoChatFilterParams {
  sharedNgLevel?: string;
  removeNgMatchedUser?: boolean;
  wordFilter?: string | string[];
  userIdFilter?: string | string[];
  commandFilter?: string | string[];
  fork0?: boolean;
  fork1?: boolean;
  fork2?: boolean;
  fork3?: boolean;
  defaultThread?: boolean;
  ownerThread?: boolean;
  communityThread?: boolean;
  nicosThread?: boolean;
  easyThread?: boolean;
  aiThread?: boolean;
  extraDefaultThread?: boolean;
  extraOwnerThread?: boolean;
  extraCommunityThread?: boolean;
  extraNicosThread?: boolean;
  extraEasyThread?: boolean;
  enableFilter?: boolean;
  wordRegFilter?: string;
  wordRegFilterFlags?: string;
}

interface TextUtilLike {
  escapeRegs(value: string): string;
}

interface ConfigLike {
  getValue(key: string): unknown;
}

//===BEGIN===
class NicoChatFilter extends Emitter {
  declare static SHARED_NG_LEVEL: {
    NONE: string;
    LOW: string;
    MID: string;
    HIGH: string;
    MAX: string;
  };
  declare static SHARED_NG_SCORE: {
    NONE: number;
    LOW: number;
    MID: number;
    HIGH: number;
    MAX: number;
  };
  declare _sharedNgLevel: string;
  declare _removeNgMatchedUser: boolean;
  declare _wordFilterList: string[];
  declare _userIdFilterList: string[];
  declare _commandFilterList: string[];
  declare _fork0: boolean;
  declare _fork1: boolean;
  declare _fork2: boolean;
  declare _fork3: boolean;
  declare _defaultThread: boolean;
  declare _ownerThread: boolean;
  declare _communityThread: boolean;
  declare _nicosThread: boolean;
  declare _easyThread: boolean;
  declare _aiThread: boolean;
  declare _extraDefaultThread: boolean;
  declare _extraOwnerThread: boolean;
  declare _extraCommunityThread: boolean;
  declare _extraNicosThread: boolean;
  declare _extraEasyThread: boolean;
  declare _enable: boolean;
  declare _wordReg: RegExp | null;
  declare _wordRegReg: RegExp | null;
  declare _userIdReg: RegExp | null;
  declare _commandReg: RegExp | null;
  declare _flags: string | undefined;
  constructor(params: NicoChatFilterParams) {
    super();
    this._sharedNgLevel = params.sharedNgLevel || NicoChatFilter.SHARED_NG_LEVEL.MID;
    this._removeNgMatchedUser = params.removeNgMatchedUser || false;

    this._wordFilterList = [];
    this._userIdFilterList = [];
    this._commandFilterList = [];
    this.wordFilterList = params.wordFilter || '';
    this.userIdFilterList = params.userIdFilter || '';
    this.commandFilterList = params.commandFilter || '';

    this._fork0 = typeof params.fork0 === 'boolean' ? params.fork0 : true;
    this._fork1 = typeof params.fork1 === 'boolean' ? params.fork1 : true;
    this._fork2 = typeof params.fork2 === 'boolean' ? params.fork2 : true;
    this._fork3 = typeof params.fork3 === 'boolean' ? params.fork3 : true;

    this._defaultThread = typeof params.defaultThread === 'boolean' ? params.defaultThread : true;
    this._ownerThread = typeof params.ownerThread === 'boolean' ? params.ownerThread : true;
    this._communityThread = typeof params.communityThread === 'boolean' ? params.communityThread : true;
    this._nicosThread = typeof params.nicosThread === 'boolean' ? params.nicosThread : true;
    this._easyThread = typeof params.easyThread === 'boolean' ? params.easyThread : true;
    this._aiThread = typeof params.aiThread === 'boolean' ? params.aiThread : true;
    this._extraDefaultThread = typeof params.extraDefaultThread === 'boolean' ? params.extraDefaultThread : true;
    this._extraOwnerThread = typeof params.extraOwnerThread === 'boolean' ? params.extraOwnerThread : true;
    this._extraCommunityThread = typeof params.extraCommunityThread === 'boolean' ? params.extraCommunityThread : true;
    this._extraNicosThread = typeof params.extraNicosThread === 'boolean' ? params.extraNicosThread : true;
    this._extraEasyThread = typeof params.extraEasyThread === 'boolean' ? params.extraEasyThread : true;

    this._enable = typeof params.enableFilter === 'boolean' ? params.enableFilter : true;

    this._wordReg = null;
    this._wordRegReg = null;
    this._userIdReg = null;
    this._commandReg = null;

    this._onChange = _.debounce(this._onChange.bind(this), 50);

    if (params.wordRegFilter) {
      this.setWordRegFilter(params.wordRegFilter, params.wordRegFilterFlags);
    }
  }
  get isEnable(): boolean {
    return this._enable;
  }
  set isEnable(v: boolean) {
    if (this._enable === v) {
      return;
    }
    this._enable = !!v;
    this._onChange();
  }
  get removeNgMatchedUser(): boolean {
    return this._removeNgMatchedUser;
  }
  set removeNgMatchedUser(v: boolean) {
    if (this._removeNgMatchedUser === v) {
      return;
    }
    this._removeNgMatchedUser = !!v;
    this.refresh();
  }
  get fork0(): boolean {
    return this._fork0;
  }
  set fork0(v: boolean) {
    v = !!v;
    if (this._fork0 === v) {
      return;
    }
    this._fork0 = v;
    this.refresh();
  }
  get fork1(): boolean {
    return this._fork1;
  }
  set fork1(v: boolean) {
    v = !!v;
    if (this._fork1 === v) {
      return;
    }
    this._fork1 = v;
    this.refresh();
  }
  get fork2(): boolean {
    return this._fork2;
  }
  set fork2(v: boolean) {
    v = !!v;
    if (this._fork2 === v) {
      return;
    }
    this._fork2 = v;
    this.refresh();
  }
  get fork3(): boolean {
    return this._fork3;
  }
  set fork3(v: boolean) {
    v = !!v;
    if (this._fork3 === v) {
      return;
    }
    this._fork3 = v;
    this.refresh();
  }
  get defaultThread(): boolean {
    return this._defaultThread;
  }
  set defaultThread(v: boolean) {
    v = !!v;
    if (this._defaultThread === v) {
      return;
    }
    this._defaultThread = v;
    this.refresh();
  }
  get ownerThread(): boolean {
    return this._ownerThread;
  }
  set ownerThread(v: boolean) {
    v = !!v;
    if (this._ownerThread === v) {
      return;
    }
    this._ownerThread = v;
    this.refresh();
  }
  get communityThread(): boolean {
    return this._communityThread;
  }
  set communityThread(v: boolean) {
    v = !!v;
    if (this._communityThread === v) {
      return;
    }
    this._communityThread = v;
    this.refresh();
  }
  get nicosThread(): boolean {
    return this._nicosThread;
  }
  set nicosThread(v: boolean) {
    v = !!v;
    if (this._nicosThread === v) {
      return;
    }
    this._nicosThread = v;
    this.refresh();
  }
  get easyThread(): boolean {
    return this._easyThread;
  }
  set easyThread(v: boolean) {
    v = !!v;
    if (this._easyThread === v) {
      return;
    }
    this._easyThread = v;
    this.refresh();
  }
  get aiThread(): boolean {
    return this._aiThread;
  }
  set aiThread(v: boolean) {
    v = !!v;
    if (this._aiThread === v) {
      return;
    }
    this._aiThread = v;
    this.refresh();
  }
  get extraDefaultThread(): boolean {
    return this._extraDefaultThread;
  }
  set extraDefaultThread(v: boolean) {
    v = !!v;
    if (this._extraDefaultThread === v) {
      return;
    }
    this._extraDefaultThread = v;
    this.refresh();
  }
  get extraOwnerThread(): boolean {
    return this._extraOwnerThread;
  }
  set extraOwnerThread(v: boolean) {
    v = !!v;
    if (this._extraOwnerThread === v) {
      return;
    }
    this._extraOwnerThread = v;
    this.refresh();
  }
  get extraCommunityThread(): boolean {
    return this._extraCommunityThread;
  }
  set extraCommunityThread(v: boolean) {
    v = !!v;
    if (this._extraCommunityThread === v) {
      return;
    }
    this._extraCommunityThread = v;
    this.refresh();
  }
  get extraNicosThread(): boolean {
    return this._extraNicosThread;
  }
  set extraNicosThread(v: boolean) {
    v = !!v;
    if (this._extraNicosThread === v) {
      return;
    }
    this._extraNicosThread = v;
    this.refresh();
  }
  get extraEasyThread(): boolean {
    return this._extraEasyThread;
  }
  set extraEasyThread(v: boolean) {
    v = !!v;
    if (this._extraEasyThread === v) {
      return;
    }
    this._extraEasyThread = v;
    this.refresh();
  }
  refresh(): void {
    this._onChange();
  }
  addWordFilter(text: unknown): void {
    const before = this._wordFilterList.join('\n');
    this._wordFilterList.push(((text as string) || '').trim());
    this._wordFilterList = [...new Set(this._wordFilterList)];
    const after = this._wordFilterList.join('\n');
    if (before === after) {
      return;
    }
    this._wordReg = null;
    this._onChange();
  }
  set wordFilterList(list: string | string[]) {
    list = [...new Set(typeof list === 'string' ? list.trim().split('\n') : list)];

    const before = this._wordFilterList.join('\n');
    let tmp: string[] = [];
    list.forEach((text) => {
      if (!text) {
        return;
      }
      tmp.push(text.trim());
    });
    tmp = _.compact(tmp);
    const after = tmp.join('\n');

    if (before === after) {
      return;
    }
    this._wordReg = null;
    this._wordFilterList = tmp;
    this._onChange();
  }
  get wordFilterList(): string[] {
    return this._wordFilterList;
  }

  setWordRegFilter(source: string, flags?: string): void {
    if (this._wordRegReg) {
      if (this._wordRegReg.source === source && this._flags === flags) {
        return;
      }
    }
    try {
      this._wordRegReg = new RegExp(source, flags);
    } catch (e) {
      window.console.error(e);
      return;
    }
    this._onChange();
  }

  addUserIdFilter(text: string): void {
    const before = this._userIdFilterList.join('\n');
    this._userIdFilterList.push(text);
    this._userIdFilterList = [...new Set(this._userIdFilterList)];
    const after = this._userIdFilterList.join('\n');
    if (before === after) {
      return;
    }
    this._userIdReg = null;
    this._onChange();
  }
  set userIdFilterList(list: string | string[]) {
    list = [...new Set(typeof list === 'string' ? list.trim().split('\n') : list)];

    const before = this._userIdFilterList.join('\n');
    let tmp: string[] = [];
    list.forEach((text) => {
      if (!text) {
        return;
      }
      tmp.push(text.trim());
    });
    tmp = _.compact(tmp);
    const after = tmp.join('\n');

    if (before === after) {
      return;
    }
    this._userIdReg = null;
    this._userIdFilterList = tmp;
    this._onChange();
  }
  get userIdFilterList(): string[] {
    return this._userIdFilterList;
  }
  addCommandFilter(text: string): void {
    const before = this._commandFilterList.join('\n');
    this._commandFilterList.push(text);
    this._commandFilterList = [...new Set(this._commandFilterList)];
    const after = this._commandFilterList.join('\n');
    if (before === after) {
      return;
    }
    this._commandReg = null;
    this._onChange();
  }
  set commandFilterList(list: string | string[]) {
    list = [...new Set(typeof list === 'string' ? list.trim().split('\n') : list)];

    const before = this._commandFilterList.join('\n');
    let tmp: string[] = [];
    list.forEach((text) => {
      if (!text) {
        return;
      }
      tmp.push(text.trim());
    });
    tmp = _.compact(tmp);
    const after = tmp.join('\n');

    if (before === after) {
      return;
    }
    this._commandReg = null;
    this._commandFilterList = tmp;
    this._onChange();
  }
  get commandFilterList(): string[] {
    return this._commandFilterList;
  }

  set sharedNgLevel(level: string) {
    if ((NicoChatFilter.SHARED_NG_LEVEL as Record<string, string>)[level] && this._sharedNgLevel !== level) {
      this._sharedNgLevel = level;
      this._onChange();
    }
  }
  get sharedNgLevel(): string {
    return this._sharedNgLevel;
  }
  getFilterFunc(): (nicoChat: NicoChat) => boolean {
    if (!this._enable) {
      return () => true;
    }
    const threthold = (NicoChatFilter.SHARED_NG_SCORE as Record<string, number>)[this._sharedNgLevel] as number;

    // NG設定の数×コメント数だけループを回すのはアホらしいので、
    // 連結した一個の正規表現を生成する
    if (!this._wordReg) {
      this._wordReg = this._buildFilterReg(this._wordFilterList);
    }
    const umatch = this._userIdFilterList.length ? this._userIdFilterList : null;
    if (!this._commandReg) {
      this._commandReg = this._buildFilterReg(this._commandFilterList);
    }
    const wordReg = this._wordReg;
    const wordRegReg = this._wordRegReg;
    const commandReg = this._commandReg;

    if ((Config as unknown as ConfigLike).getValue('debug')) {
      return (nicoChat: NicoChat) => {
        if (nicoChat.fork === 1) {
          return true;
        }
        const score = nicoChat.score;
        if (score <= threthold) {
          window.console.log(
            '%cNG共有適用: %s <= %s %s %s秒 %s',
            'background: yellow;',
            score,
            threthold,
            nicoChat.type,
            nicoChat.vpos / 100,
            nicoChat.text
          );
          return false;
        }
        let m: RegExpExecArray | boolean | null = null;
        if (wordReg) {
          m = wordReg.exec(nicoChat.text);
        }
        if (m) {
          window.console.log(
            '%cNGワード: "%s" %s %s秒 %s',
            'background: yellow;',
            m[1],
            nicoChat.type,
            nicoChat.vpos / 100,
            nicoChat.text
          );
          return false;
        }

        if (wordRegReg) {
          m = wordRegReg.exec(nicoChat.text);
        }
        if (m) {
          window.console.log(
            '%cNGワード(正規表現): "%s" %s %s秒 %s',
            'background: yellow;',
            m[1],
            nicoChat.type,
            nicoChat.vpos / 100,
            nicoChat.text
          );
          return false;
        }

        if (umatch && umatch.includes(nicoChat.userId as string)) {
          window.console.log(
            '%cNGID: "%s" %s %s秒 %s %s',
            'background: yellow;',
            nicoChat.userId,
            nicoChat.type,
            nicoChat.vpos / 100,
            nicoChat.userId,
            nicoChat.text
          );
          return false;
        }
        if (commandReg) {
          m = commandReg.test(nicoChat.cmd);
        }
        if (m) {
          window.console.log(
            '%cNG command: "%s" %s %s秒 %s %s',
            'background: yellow;',
            (m as unknown as RegExpExecArray)[1],
            nicoChat.type,
            nicoChat.vpos / 100,
            nicoChat.cmd,
            nicoChat.text
          );
          return false;
        }

        return true;
      };
    }

    return (nicoChat: NicoChat) => {
      if (nicoChat.fork === 1) {
        //fork1 投稿者コメントはNGしない
        return true;
      }
      const text = nicoChat.text;
      return !(
        nicoChat.score <= threthold ||
        (wordReg && wordReg.test(text)) ||
        (wordRegReg && wordRegReg.test(text)) ||
        (umatch && umatch.includes(nicoChat.userId as string)) ||
        (commandReg && commandReg.test(nicoChat.cmd))
      );
    };
  }
  applyFilter(nicoChatArray: NicoChat[]): NicoChat[] {
    const before = nicoChatArray.length;
    if (before < 1) {
      return nicoChatArray;
    }
    const timeKey = 'applyNgFilter: ' + (nicoChatArray[0] as NicoChat).type;
    window.console.time(timeKey);
    const filterFunc = this.getFilterFunc();
    let result = nicoChatArray.filter(filterFunc);
    const removedUserIds =
      before !== result.length && this._removeNgMatchedUser
        ? nicoChatArray.filter((chat) => !result.includes(chat)).map((chat) => chat.userId)
        : [];
    const denyTypes = [!this.fork0 && 0, !this.fork1 && 1, !this.fork2 && 2, !this.fork3 && 3].filter(
      (type) => type !== false
    );
    const denyThreadTypes = [
      !this.defaultThread && 'default',
      !this.ownerThread && 'owner',
      !this.communityThread && 'community',
      !this.nicosThread && 'nicos',
      !this.easyThread && 'easy',
      !this.aiThread && 'ai',
      !this.extraDefaultThread && 'extra-default',
      !this.extraOwnerThread && 'extra-owner',
      !this.extraCommunityThread && 'extra-community',
      !this.extraNicosThread && 'extra-nicos',
      !this.extraEasyThread && 'extra-easy',
    ].filter((type) => type !== false);
    result = result.filter((chat) => {
      if (removedUserIds.length > 0 && removedUserIds.includes(chat.userId)) {
        return false;
      }
      return !denyTypes.includes(chat.fork) && !denyThreadTypes.includes(chat.threadLabel as string);
    });
    window.console.timeEnd(timeKey);
    window.console.log('NG判定結果: %s/%s', result.length, before);
    return result;
  }
  isSafe(nicoChat: NicoChat): boolean {
    return this.getFilterFunc()(nicoChat);
  }
  _buildFilterReg(filterList: string[]): RegExp | null {
    if (filterList.length < 1) {
      return null;
    }
    const textUtilLike = textUtil as unknown as TextUtilLike;
    const r = filterList.filter((f) => f).map((f) => textUtilLike.escapeRegs(f));
    return new RegExp('(' + r.join('|') + ')', 'i');
  }
  _buildFilterPerfectMatchinghReg(filterList: string[]): RegExp | null {
    if (filterList.length < 1) {
      return null;
    }
    const textUtilLike = textUtil as unknown as TextUtilLike;
    const r = filterList.filter((f) => f).map((f) => textUtilLike.escapeRegs(f));
    return new RegExp('^(' + r.join('|') + ')$');
  }
  _onChange(): void {
    console.log('NicoChatFilter.onChange');
    this.emit('change');
  }
}

NicoChatFilter.SHARED_NG_LEVEL = {
  NONE: 'NONE',
  LOW: 'LOW',
  MID: 'MID',
  HIGH: 'HIGH',
  MAX: 'MAX',
};
NicoChatFilter.SHARED_NG_SCORE = {
  NONE: -99999, //Number.MIN_VALUE,
  LOW: -10000,
  MID: -5000,
  HIGH: -1000,
  MAX: -1,
};

//===END===
export { NicoChatFilter };

// return nicoChat => {
//   if (nicoChat.fork > 0) {
//     return true;
//   }

//   if (nicoChat.score <= threthold) {
//     return false;
//   }

//   if (wordReg && wordReg.test(nicoChat.text)) {
//     return false;
//   }

//   if (wordRegReg && wordRegReg.test(nicoChat.text)) {
//     return false;
//   }

//   if (userIdReg && userIdReg.test(nicoChat.text)) {
//     return false;
//   }

//   if (commandReg && commandReg.test(nicoChat.cmd)) {
//     return false;
//   }

//   return true;
// };
// }
