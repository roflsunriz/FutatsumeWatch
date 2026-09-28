export interface UqRaf {
  toggleClass(className: string, force?: boolean): Uq;
  addClass(className: string): Uq;
  removeClass(className: string): Uq;
  css(key: string, value: string): Uq;
}

export interface Uq {
  [index: number]: Element | undefined;
  on(event: string, listener: unknown, options?: unknown): Uq;
  find(query: string): Uq;
  css(key: string, value: string): Uq;
  attr(key: string, value: string | number | undefined): Uq;
  attr(key: string): string | null;
  text(value: string | number): Uq;
  addClass(className: string): Uq;
  removeClass(className: string): Uq;
  toggleClass(className: string, force?: boolean): Uq;
  hasClass(className: string): boolean;
  hasFocus(): boolean;
  val(): string;
  val(value: string): Uq;
  focus(): Uq;
  blur(): Uq;
  prop(name: string, value?: unknown): unknown;
  append(child: unknown): Uq;
  appendTo(target: unknown): Uq;
  end(): Uq;
  raf: UqRaf;
}

export interface UqFactory {
  (query: unknown, ...args: unknown[]): Uq;
  html(html: string): Uq;
}

export interface ClassListLike {
  add(className: string): void;
  remove(className: string): void;
  toggle(className: string, force?: boolean): void;
  contains(className: string): boolean;
}

export interface NicoChatItem {
  vpos: string;
  text: string;
  userId: string;
  date: number;
  fork: number;
  no: number;
  color: string;
  fontCommand: string;
  isSubThread: boolean;
  cmd: string;
  uniqNo: string;
  threadId: string;
  time3d: number;
  time3dp: number;
  nicoru: number;
  nicotta: boolean;
  duration: number;
  valhalla: string;
  isMine: boolean;
}

export interface ChatListData {
  top: NicoChatItem[];
  naka: NicoChatItem[];
  bottom: NicoChatItem[];
}

export interface ThreadInfo {
  threadId: number;
  isWaybackMode: boolean;
  when: number;
}
