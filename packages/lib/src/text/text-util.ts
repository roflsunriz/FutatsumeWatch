type DateInput = string | number | Date;

//===BEGIN===

const textUtil = {
  secToTime: (sec: number): string => {
    return [
      Math.floor(sec / 60)
        .toString()
        .padStart(2, '0'),
      (Math.floor(sec) % 60).toString().padStart(2, '0'),
    ].join(':');
  },
  parseQuery: (query = ''): Record<string, string> => {
    query = query.startsWith('?') ? query.substr(1) : query;
    const result: Record<string, string> = {};
    query.split('&').forEach((item) => {
      const sp = item.split('=');
      const key = decodeURIComponent(sp[0] as string);
      const val = decodeURIComponent(sp.slice(1).join('='));
      result[key] = val;
    });
    return result;
  },
  parseUrl: (url: string): HTMLAnchorElement => {
    url = url || 'https://unknown.example.com/';
    return Object.assign(document.createElement('a'), { href: url });
  },
  decodeBase64: (str: string): string => {
    try {
      return decodeURIComponent(
        escape(
          atob(
            str
              .replace(/-/g, '+')
              .replace(/_/g, '/')
              .padEnd(Math.ceil(str.length / 4) * 4, '=')
          )
        )
      );
    } catch {
      return '';
    }
  },
  encodeBase64: (str: string): string => {
    try {
      return btoa(unescape(encodeURIComponent(str)));
    } catch {
      return '';
    }
  },
  escapeHtml: (text: string): string => {
    const map = {
      '&': '&amp;',
      '\x27': '&#39;',
      '"': '&quot;',
      '<': '&lt;',
      '>': '&gt;',
    };
    return text.replace(/[&"'<>]/g, (char) => map[char as keyof typeof map]);
  },
  unescapeHtml: (text: string): string => {
    const map = {
      '&amp;': '&',
      '&#39;': '\x27',
      '&quot;': '"',
      '&lt;': '<',
      '&gt;': '>',
    };
    return text.replace(/(&amp;|&#39;|&quot;|&lt;|&gt;)/g, (char) => map[char as keyof typeof map]);
  },
  // 基本的に動画タイトルはエスケープされている。
  // だが、なんかたまにいいかげんなデータがあるし、本当に信用できるか？
  // そこで、全角に置き換えてごますんだ！
  escapeToZenkaku: (text: string): string => {
    const map = {
      '&': '＆',
      "'": '’',
      '"': '”',
      '<': '＜',
      '>': '＞',
    };
    return text.replace(/["'<>]/g, (char) => map[char as keyof typeof map]);
  },
  escapeRegs: (text: string): string => {
    const match = /[\\^$.*+?()[\]{}|]/g;
    // return text.replace(/[\\\*\+\.\?\{\}\(\)\[\]\^\$\-\|\/]/g, char => {
    return text.replace(match, '\\$&');
  },
  // 漢数字のタイトルのソートに使うだけなので百とか千とか考えない
  convertKansuEi: (text: string): string => {
    // `〇話,一話,二話,三話,四話,五話,六話,七話,八話,九話,十話,十一話,十二話,十三話,
    // 十四話,十五話,十六話,十七話,十八話,十九話,二十話,二十一話,二十二話,二十三話,二十四話,二十五話,二十六話`
    // .split(',').map(c => convertKansuEi(c).replace(/([0-9]{1,9})/g, m =>  m.padStart(3, '0'))).sort()
    const match = /[〇一二三四五六七八九零壱弐惨伍]/g;
    const map = {
      〇: '0',
      零: '0',
      一: '1',
      壱: '1',
      二: '2',
      弐: '2',
      三: '3',
      惨: '3',
      四: '4',
      五: '5',
      伍: '5',
      六: '6',
      七: '7',
      八: '8',
      九: '9',
      // '十': 'Ａ', '拾': 'Ａ'
    };
    text = text.replace(match, (char) => map[char as keyof typeof map]);
    text = text.replace(/([1-9]?)[十拾]([0-9]?)/g, (n, a, b) =>
      a && b ? `${a}${b}` : a ? String(a * 10) : String(10 + b * 1)
    );
    return text;
  },
  dateToString: (date: DateInput): string => {
    if (typeof date === 'string') {
      const origDate = date;
      date = date.replace(/\//g, '-');
      // 時差とか考慮してない
      const m = /^(\d+-\d+-\d+) (\d+):(\d+):(\d+)/.exec(date);
      if (m) {
        date = new Date(m[1] as string);
        date.setHours(m[2] as unknown as number);
        date.setMinutes(m[3] as unknown as number);
        date.setSeconds(m[4] as unknown as number);
      } else {
        const t = Date.parse(date);
        if (isNaN(t)) {
          return origDate;
        }
        date = new Date(t);
      }
    } else if (typeof date === 'number') {
      date = new Date(date);
    }
    if (!date || isNaN(date.getTime())) {
      return '1970/01/01 00:00:00';
    }

    const [yy, mm, dd, h, m, s] = [
      date.getFullYear(),
      date.getMonth() + 1,
      date.getDate(),
      date.getHours(),
      date.getMinutes(),
      date.getSeconds(),
    ].map((n) => n.toString().padStart(2, '0')) as [string, string, string, string, string, string];
    return `${yy}/${mm}/${dd} ${h}:${m}:${s}`;
  },
  isValidJson: (data: string): boolean => {
    try {
      JSON.parse(data);
      return true;
    } catch {
      return false;
    }
  },
  toRgba: (c: string, alpha = 1): string =>
    `rgba(${parseInt(c.substr(1, 2), 16)}, ${parseInt(c.substr(3, 2), 16)}, ${parseInt(c.substr(5, 2), 16)}, ${alpha})`,
  snakeToCamel: (snake: string): string => snake.replace(/-./g, (s) => s.charAt(1).toUpperCase()),
  camelToSnake: (camel: string, separator = '_'): string =>
    camel.replace(/([A-Z])/g, (s) => separator + s.toLowerCase()),
};

//===END===

export { textUtil };
export type { DateInput };
