// {
//   "icon": "https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/86/865591.jpg?1411004988",
//   "url": "//www.nicovideo.jp/user/865591",
//   "id": "865591",
//   "linkId": "user/865591",
//   "name": "ピノキオピー さん",
//   "favorite": false,
//   "type": "user",
//   "isMyVideoPublic": false
// }
interface VideoOwnerInfo {
  icon: string;
  url: string;
  id: number;
  linkId: string;
  name: string;
  favorite: boolean;
  type: string;
  isMyVideoPublic: boolean;
}

//===BEGIN===

class VideoOwnerInfoElement extends HTMLElement {
  props: VideoOwnerInfo;
  declare static DEFAULT_ICON: string;
  private _shadow: ShadowRoot;
  constructor() {
    super();
    this._shadow = this.attachShadow({ mode: 'open' });
    this.props = {
      icon: VideoOwnerInfoElement.DEFAULT_ICON,
      url: '',
      id: 0,
      linkId: '',
      name: 'guest',
      favorite: false,
      type: '',
      isMyVideoPublic: false,
    };
  }

  get info(): VideoOwnerInfo {
    return Object.assign({}, this.props);
  }

  set info(info: VideoOwnerInfo) {
    let changed = false;
    const current = this.props as unknown as Record<string, string | number | boolean>;
    const incoming = info as unknown as Record<string, string | number | boolean>;
    for (const key of Object.keys(current)) {
      if (current[key] !== incoming[key]) {
        changed = true;
        current[key] = incoming[key] as string | number | boolean;
      }
    }
    if (changed) {
      this.render();
    }
  }

  render(): void {
    this._shadow.innerHTML = `
    `;
  }
}
Object.assign(VideoOwnerInfoElement, {
  DEFAULT_ICON: 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/defaults/blank.jpg',
});

//===END===
export { VideoOwnerInfoElement };
