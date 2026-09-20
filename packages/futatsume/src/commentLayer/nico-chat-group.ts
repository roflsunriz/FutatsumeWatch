import { Emitter } from '../../../lib/src/emitter';
import { NicoChatFilter } from './nico-chat-filter';
import type { NicoChatType as NicoChat } from './nico-chat';

interface NicoChatGroupParams {
  nicoChatFilter: NicoChatFilter;
}

//===BEGIN===
class NicoChatGroup extends Emitter {
  declare _type: string;
  declare _nicoChatFilter: NicoChatFilter;
  declare _members: NicoChat[];
  declare _filteredMembers: NicoChat[];
  declare _currentTime: number | undefined;
  declare _sharedNgLevel: string | undefined;
  constructor(...args: [string, NicoChatGroupParams]) {
    super();
    this.initialize(...args);
  }
  initialize(type: string, params: NicoChatGroupParams): void {
    this._type = type;

    this._nicoChatFilter = params.nicoChatFilter;
    this._nicoChatFilter.on('change', this._onFilterChange.bind(this));

    this.reset();
  }
  reset(): void {
    this._members = [];
    this._filteredMembers = [];
  }
  addChatArray(nicoChatArray: NicoChat[]): void {
    const members = this._members;
    let newMembers: NicoChat[] = [];
    for (const nicoChat of nicoChatArray) {
      newMembers.push(nicoChat);
      members.push(nicoChat);
      nicoChat.group = this;
    }

    newMembers = this._nicoChatFilter.applyFilter(nicoChatArray);
    if (newMembers.length > 0) {
      this._filteredMembers = this._filteredMembers.concat(newMembers);
      this.emit('addChatArray', newMembers);
    }
  }
  addChat(nicoChat: NicoChat): void {
    this._members.push(nicoChat);
    nicoChat.group = this;
    this._filteredMembers = this._nicoChatFilter.applyFilter(this._members).slice();
    if (this._filteredMembers.includes(nicoChat)) {
      this.emit('addChat', nicoChat);
    }
  }
  _getChat(nicoChat: NicoChat): (chat: NicoChat) => boolean {
    return (chat) => chat.threadId === nicoChat.threadId && chat.fork === nicoChat.fork && chat.no === nicoChat.no;
  }
  removeChat(nicoChat: NicoChat): void {
    const getChat = this._getChat(nicoChat);
    const index =
      this._members.indexOf(nicoChat) >= 0 ? this._members.indexOf(nicoChat) : this._members.findIndex(getChat);
    if (index < 0) return;
    this._members.splice(index, 1);
    nicoChat.group = this;

    this.onChange(null);
  }
  get type(): string {
    return this._type;
  }
  get members(): NicoChat[] {
    if (this._filteredMembers.length > 0) {
      return this._filteredMembers;
    }
    return (this._filteredMembers = this._nicoChatFilter.applyFilter(this._members).slice());
  }
  get nonFilteredMembers(): NicoChat[] {
    return this._members;
  }
  onChange(e: { chat: unknown } | null): void {
    console.log('NicoChatGroup.onChange: ', e);
    this._filteredMembers = [];
    this.emit('change', {
      chat: e,
      group: this,
    });
  }
  _onFilterChange(): void {
    this._filteredMembers = [];
    this.onChange(null);
  }
  get currentTime(): number | undefined {
    return this._currentTime;
  }
  set currentTime(sec: number) {
    this._currentTime = sec;
    // let m = this._members;
    // for (let i = 0, len = m.length; i < len; i++) {
    //   m[i].currentTime = sec;
    // }
  }
  setSharedNgLevel(level: string): void {
    if ((NicoChatFilter.SHARED_NG_LEVEL as Record<string, string>)[level] && this._sharedNgLevel !== level) {
      this._sharedNgLevel = level;
      this.onChange(null);
    }
  }
  includes(nicoChat: NicoChat): NicoChat | undefined {
    const uno = nicoChat.uniqNo;
    return this._members.find((m) => m.uniqNo === uno);
  }
}

//===END===

export { NicoChatGroup };
