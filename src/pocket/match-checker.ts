import _ from 'lodash';
import type { MatchCheckerInit, MatchTargetData } from './types';

export function createMatchChecker(escapeRegs: (text: string) => string) {
  class MatchChecker {
    _tag!: string[];
    _word!: RegExp | null;
    _userId!: number[];
    _channelId!: number[];
    constructor({ word = '', tag = '', owner = '' }: MatchCheckerInit) {
      this.init({ word, tag, owner });
    }

    init({ word = '', tag = '', owner = '' }: MatchCheckerInit): void {
      this._tag = [];
      tag.split(/[\r\n]+/).forEach((t) => {
        if (t) {
          this._tag.push(t.trim());
        }
      });
      this._tag = _.uniq(this._tag);

      let wordTmp: string[] = [];
      this._word = null;
      word.split(/[\r\n]+/).forEach((w) => {
        if (w) {
          wordTmp.push(escapeRegs(w.trim()));
        }
      });
      wordTmp = _.uniq(wordTmp);
      if (wordTmp.length > 0) {
        this._word = new RegExp('(' + wordTmp.join('|') + ')', 'i');
      }

      this._userId = [];
      this._channelId = [];
      owner.split(/[\r\n]+/).forEach((o) => {
        if (typeof o === 'string') {
          const id = o.split('#')[0]!.trim();
          if (id.startsWith('ch')) {
            this._channelId.push(parseInt(id.substring(2)));
          } else {
            this._userId.push(parseInt(id));
          }
        }
      });
      this._userId = _.uniq(this._userId);
      this._channelId = _.uniq(this._channelId);
    }

    isMatch(data: MatchTargetData): boolean | undefined {
      if (this._isMatchTag(data.tagList)) {
        return true;
      }
      if (this._isMatchOwner(data.owner)) {
        return true;
      }
      if (this._isMatchWord({ title: data.title, description: data.description })) {
        return true;
      }
    }

    _isMatchTag(tagList: (string | { text: string })[] = []): boolean {
      if (this._tag.length < 1) {
        return false;
      }

      const tagTmp: string[] = [];
      tagList.forEach((t: string | { text: string }) => {
        if (t) {
          tagTmp.push(escapeRegs(typeof t === 'string' ? t.trim() : t.text.trim()));
        }
      });
      const tagReg = new RegExp(' (' + tagTmp.join('|') + ') ', 'i');
      const _tag = ' ' + this._tag.join(' ') + ' ';
      return tagReg.test(_tag);
    }

    _isMatchOwner(owner: { type: string; id: string }): boolean {
      const _id = owner.type === 'user' ? this._userId : this._channelId;
      return _id.includes(parseInt(owner.id, 10));
    }

    _isMatchWord({ title, description }: { title: string; description: string }): boolean {
      if (!this._word) {
        return false;
      }
      return this._word.test(title) || this._word.test(description);
    }

    isMatchTag(tag: string | { text: string }): boolean {
      return this._isMatchTag([tag]);
    }

    isMatchOwner(owner: { type: string; id: string }): boolean {
      return this._isMatchOwner(owner);
    }
  }

  class NgChecker extends MatchChecker {
    isNg(data: MatchTargetData): boolean | undefined {
      return super.isMatch(data);
    }
  }
  return { MatchChecker, NgChecker };
}
