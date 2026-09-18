interface SpeechOption {
  lang?: string;
  pitch?: number;
  rate?: number;
  voice?: SpeechSynthesisVoice;
  volume?: number;
}

//===BEGIN===
class speech {
  static promise: Promise<unknown>;
  static _voices: SpeechSynthesisVoice[] | undefined;
  static async speak(text: string, option: SpeechOption = {}): Promise<unknown> {
    if (!window.speechSynthesis) {
      return Promise.resolve();
    }
    const msg = new window.SpeechSynthesisUtterance();

    ['lang', 'pitch', 'rate', 'voice', 'volume'].forEach((prop) => {
      if (Object.prototype.hasOwnProperty.call(option, prop)) {
        (msg as unknown as Record<string, unknown>)[prop] = (option as unknown as Record<string, unknown>)[prop];
      }
    });

    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
    } else {
      await this.promise;
    }

    return (this.promise = new Promise((res) => {
      msg.addEventListener('end', res, { once: true });
      msg.addEventListener('error', res, { once: true });
      msg.text = text;
      window.speechSynthesis.speak(msg);
    }));
  }
  static voices(lang?: string): SpeechSynthesisVoice[] {
    if (!window.speechSynthesis) {
      return [];
    }
    this._voices = this._voices || window.speechSynthesis.getVoices();
    return lang ? this._voices.filter((v) => v.lang === lang) : this._voices;
  }
}
speech.promise = Promise.resolve();
//===END===

export { speech };
export type { SpeechOption };
