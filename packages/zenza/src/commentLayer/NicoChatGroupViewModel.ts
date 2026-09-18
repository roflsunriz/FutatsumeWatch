import { NicoChatViewModel } from './NicoChatViewModel';
import { CommentLayoutWorker } from './CommentLayoutWorker';
import { NicoChat } from './NicoChat';
import type { NicoChatType } from './NicoChat';
import type { NicoChatGroup } from './NicoChatGroup';

interface NicoChatViewModelLike {
  readonly type: string;
  readonly text: string;
  readonly id: unknown;
  readonly no: number;
  readonly fork: number;
  readonly vpos: number;
  readonly uniqNo: number;
  readonly isInvisible: boolean;
  readonly isOverflow: boolean;
  isLayouted: boolean;
  slot: unknown;
  readonly beginLeftTiming: number;
  readonly endRightTiming: number;
  readonly inviewTiming: number;
  bulkLayoutData: unknown;
  reset(): void;
  recalcBeginEndTiming(speedRate: number): void;
  checkCollision(target: NicoChatViewModelLike): boolean;
  moveToNextLine(other: NicoChatViewModelLike): void;
  isInViewBySecond(sec: number): boolean;
  export(): string;
}

interface NicoChatViewModelFactory {
  create(nicoChat: NicoChatType, offScreen: unknown): NicoChatViewModelLike;
  emitter: { on(name: string, handler: (...args: unknown[]) => void): void };
  SPEED_RATE: number;
}

interface CommentLayoutWorkerLike {
  getInstance(): { post(message: unknown): Promise<unknown> };
}

interface LayoutWorkerResult {
  lastUpdate: unknown;
  members: unknown[];
}

//===BEGIN===
class NicoChatGroupViewModel {
  declare _nicoChatGroup: NicoChatGroup;
  declare _offScreen: unknown;
  declare _members: NicoChatViewModelLike[];
  declare _lastUpdate: number;
  declare _vSortedMembers: NicoChatViewModelLike[];
  declare _layoutWorker: { post(message: unknown): Promise<unknown> };
  declare _hasLayout: boolean | undefined;
  declare _layout: (() => void) | undefined;
  constructor(...args: [NicoChatGroup, unknown]) {
    this.initialize(...args);
  }
  initialize(nicoChatGroup: NicoChatGroup, offScreen: unknown): void {
    this._nicoChatGroup = nicoChatGroup;
    this._offScreen = offScreen;
    this._members = [];
    this._lastUpdate = 0;

    // メンバーをvposでソートした物. 計算効率改善用
    this._vSortedMembers = [];

    this._initWorker();

    const viewModelFactory = NicoChatViewModel as unknown as NicoChatViewModelFactory;
    nicoChatGroup.on('addChat', (nicoChat: unknown) => this._onAddChat(nicoChat as NicoChatType));
    nicoChatGroup.on('addChatArray', (nicoChatArray: unknown) => this._onAddChatArray(nicoChatArray as NicoChatType[]));
    nicoChatGroup.on('reset', () => this._onReset());
    nicoChatGroup.on('change', (e: unknown) => this._onChange(e));
    viewModelFactory.emitter.on('updateBaseChatScale', (e: unknown) => this._onChange(e));
    viewModelFactory.emitter.on('updateCommentSpeedRate', () => this._onCommentSpeedRateUpdate());

    void this.addChatArray(nicoChatGroup.members);
  }
  _initWorker(): void {
    const worker = CommentLayoutWorker as unknown as CommentLayoutWorkerLike;
    this._layoutWorker = worker.getInstance();
  }
  _onAddChatArray(nicoChatArray: NicoChatType[]): void {
    void this.addChatArray(nicoChatArray);
  }
  _onAddChat(nicoChat: NicoChatType): void {
    this.addChat(nicoChat);
  }
  _onReset(): void {
    this.reset();
  }
  _onChange(e: unknown): void {
    console.log('NicoChatGroupViewModel.onChange: ', e);
    window.console.time('_onChange');
    this.reset();
    void this.addChatArray(this._nicoChatGroup.members);
    window.console.timeEnd('_onChange');
  }
  async _execCommentLayoutWorker(): Promise<void> {
    if (this._members.length < 1) {
      return;
    }
    const type = (this._members[0] as NicoChatViewModelLike).type;
    // this._workerRequestId = `id:${type}-${Math.random()}`;

    const result = (await this._layoutWorker.post({
      command: 'layout',
      params: {
        type,
        members: this.bulkLayoutData,
        lastUpdate: this._lastUpdate,
        // requestId: this._workerRequestId
      },
    })) as LayoutWorkerResult;
    if (result.lastUpdate !== this._lastUpdate) {
      console.warn('group changed', this._lastUpdate, result.lastUpdate);
      return;
    }
    this.bulkLayoutData = result.members;
  }
  async addChatArray(nicoChatArray: NicoChatType[]): Promise<void> {
    const viewModelFactory = NicoChatViewModel as unknown as NicoChatViewModelFactory;
    for (let i = 0, len = nicoChatArray.length; i < len; i++) {
      const nicoChat = nicoChatArray[i] as NicoChatType;
      const nc = viewModelFactory.create(nicoChat, this._offScreen);
      this._members.push(nc);
      if (i % 100 === 99) {
        await new Promise((r) => setTimeout(r, 10));
      }
    }

    if (this._members.length < 1) {
      return;
    }

    this._lastUpdate = Date.now();
    void this._execCommentLayoutWorker();
  }
  _onCommentSpeedRateUpdate(): void {
    const viewModelFactory = NicoChatViewModel as unknown as NicoChatViewModelFactory;
    this.changeSpeed(viewModelFactory.SPEED_RATE);
  }
  changeSpeed(speedRate = 1): void {
    // TODO: y座標と弾幕判定はリセットしないといけない気がする
    for (const member of this._members) {
      member.recalcBeginEndTiming(speedRate);
    }
    void this._execCommentLayoutWorker();
  }
  _groupCollision(): void {
    this._createVSortedMembers();
    const members = this._vSortedMembers;
    for (let i = 0, len = members.length; i < len; i++) {
      const o = members[i] as NicoChatViewModelLike;
      this.checkCollision(o);
      o.isLayouted = true;
    }
  }
  addChat(nicoChat: NicoChatType): void {
    const timeKey = 'addChat:' + nicoChat.text;
    window.console.time(timeKey);
    const viewModelFactory = NicoChatViewModel as unknown as NicoChatViewModelFactory;
    const nc = viewModelFactory.create(nicoChat, this._offScreen);

    this._lastUpdate = Date.now();

    // 内部処理効率化の都合上、
    // 自身を追加する前に判定を行っておくこと
    this.checkCollision(nc);
    nc.isLayouted = true;

    this._members.push(nc);

    void this._execCommentLayoutWorker();
    window.console.timeEnd(timeKey);
  }
  reset(): void {
    const m = this._members;
    for (let i = 0, len = m.length; i < len; i++) {
      (m[i] as NicoChatViewModelLike).reset();
    }

    this._members = [];
    this._vSortedMembers = [];
    this._lastUpdate = Date.now();
  }
  get currentTime(): number | undefined {
    return this._nicoChatGroup.currentTime;
  }
  get type(): string {
    return this._nicoChatGroup.type;
  }
  checkCollision(target: NicoChatViewModelLike): void {
    if (target.isInvisible) {
      return;
    }

    const m = this._vSortedMembers;
    const beginLeft = target.beginLeftTiming;
    for (let i = 0, len = m.length; i < len; i++) {
      const o = m[i] as NicoChatViewModelLike;

      // 自分よりうしろのメンバーには影響を受けないので処理不要
      if (o === target) {
        return;
      }

      if (beginLeft > o.endRightTiming) {
        continue;
      }

      if (o.checkCollision(target)) {
        target.moveToNextLine(o);

        // ずらした後は再度全チェックするのを忘れずに(再帰)
        if (!target.isOverflow) {
          this.checkCollision(target);
          return;
        }
      }
    }
  }
  get bulkLayoutData(): unknown[] {
    this._createVSortedMembers();
    const m = this._vSortedMembers;
    const result: unknown[] = [];
    for (let i = 0, len = m.length; i < len; i++) {
      result.push((m[i] as NicoChatViewModelLike).bulkLayoutData);
    }
    return result;
  }
  set bulkLayoutData(data: unknown[]) {
    const m = this._vSortedMembers;
    for (let i = 0, len = m.length; i < len; i++) {
      (m[i] as NicoChatViewModelLike).bulkLayoutData = data[i];
    }
  }
  get bulkSlotData(): Array<Record<string, unknown>> {
    this._createVSortedMembers();
    const m = this._vSortedMembers;
    const result: Array<Record<string, unknown>> = [];
    for (let i = 0, len = m.length; i < len; i++) {
      const o = m[i] as NicoChatViewModelLike;
      result.push({
        id: o.id,
        slot: o.slot,
        fork: o.fork,
        no: o.no,
        vpos: o.vpos,
        begin: o.inviewTiming,
        end: o.endRightTiming,
        invisible: o.isInvisible,
      });
    }
    return result;
  }
  set bulkSlotData(data: Array<{ slot: unknown }>) {
    const m = this._vSortedMembers;
    for (let i = 0, len = m.length; i < len; i++) {
      (m[i] as NicoChatViewModelLike).slot = (data[i] as { slot: unknown }).slot;
    }
  }
  /**
   * vposでソートされたメンバーを生成. 計算効率改善用
   */
  _createVSortedMembers(): NicoChatViewModelLike[] {
    this._vSortedMembers = this._members.concat().sort((a, b) => NicoChat.SORT_FUNCTION(a, b));
    return this._vSortedMembers;
  }

  get members(): NicoChatViewModelLike[] {
    return this._members;
  }

  /**
   * 現時点で表示状態のメンバーのみを返す
   */
  get inViewMembers(): NicoChatViewModelLike[] {
    return this.getInViewMembersBySecond(this.currentTime);
  }
  // getMembers() {return this._members;}
  // getInViewMembers() {return this.inViewMembers;}

  /**
   * secの時点で表示状態のメンバーのみを返す
   */
  getInViewMembersBySecond(sec: number | undefined): NicoChatViewModelLike[] {
    // TODO: もっと効率化
    //var maxDuration = NicoChatViewModel.DURATION.NAKA;

    const result: NicoChatViewModelLike[] = [];
    const m = this._vSortedMembers,
      len = m.length;
    for (let i = 0; i < len; i++) {
      const chat = m[i] as NicoChatViewModelLike; //, s = m.getBeginLeftTiming();
      //if (sec - s > maxDuration) { break; }
      if (chat.isInViewBySecond(sec as number)) {
        result.push(chat);
      }
    }
    //console.log('inViewMembers.length: ', result.length, sec);
    return result;
  }
  getInViewMembersByVpos(vpos: number): NicoChatViewModelLike[] {
    if (!this._hasLayout) {
      (this._layout as () => void)();
    }
    return this.getInViewMembersBySecond(vpos / 100);
  }
  export(): string {
    const result: string[] = [];
    const m = this._members,
      len = m.length;

    result.push(['\t<group ', 'type="', this._nicoChatGroup.type, '" ', 'length="', m.length, '" ', '>'].join(''));

    for (let i = 0; i < len; i++) {
      result.push((m[i] as NicoChatViewModelLike).export());
    }

    result.push('\t</group>');
    return result.join('\n');
  }
  getCurrentTime(): number | undefined {
    return this.currentTime;
  }
  getType(): string {
    return this.type;
  }
}
//===END===
export { NicoChatGroupViewModel };
