import { sleep } from './sleep';

//===BEGIN===
class RequestAnimationFrame {
  _frameSkip: number;
  _frameCount: number;
  _callback: () => void;
  _enable: boolean;
  _isOnce: boolean;
  _isBusy: boolean;
  _requestId?: number | null;
  constructor(callback: () => void, frameSkip?: number) {
    this._frameSkip = Math.max(0, typeof frameSkip === 'number' ? frameSkip : 0);
    this._frameCount = 0;
    this._callback = callback;
    this._enable = false;
    this._onFrame = this._onFrame.bind(this);
    // this._callRaf = this._callRaf.bind(this);
    this._isOnce = false;
    this._isBusy = false;
  }
  _onFrame(): void {
    if (!this._enable || this._isBusy) {
      this._requestId = null;
      return;
    }
    this._isBusy = true;
    this._frameCount++;
    if (this._frameCount % (this._frameSkip + 1) === 0) {
      this._callback();
    }
    if (this._isOnce) {
      return this.disable();
    }
    void this.callRaf();
  }
  async callRaf(): Promise<void> {
    await sleep.resolve;
    // _onFrame は constructor で bind 済みのため unbind のまま渡す
    // eslint-disable-next-line @typescript-eslint/unbound-method
    this._requestId = requestAnimationFrame(this._onFrame);
    this._isBusy = false;
  }
  enable(): void {
    if (this._enable) {
      return;
    }
    this._enable = true;
    this._isBusy = false;
    if (this._requestId) {
      cancelAnimationFrame(this._requestId);
    }
    // _onFrame は constructor で bind 済みのため unbind のまま渡す
    // eslint-disable-next-line @typescript-eslint/unbound-method
    this._requestId = requestAnimationFrame(this._onFrame);
  }
  disable(): void {
    this._enable = false;
    this._isOnce = false;
    this._isBusy = false;

    if (this._requestId) {
      cancelAnimationFrame(this._requestId);
    }
    this._requestId = null;
  }
  execOnce(): void {
    if (this._enable) {
      return;
    }
    this._isOnce = true;
    this.enable();
  }
}

//===END===
export { RequestAnimationFrame };
