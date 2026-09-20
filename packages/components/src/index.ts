import { BaseCommandElement } from './element/base-command-element';
import { VideoItemElement } from './element/video-item-element';
import { VideoSeriesLabel } from './element/video-series-label';
import './element/no-web-component';
import { RangeBarElement } from './element/range-bar-element';
import { DialogElement } from './element/dialog-element';
import { SettingPanelElement } from './element/setting-panel-element';

//===BEGIN===
//@require ./element/base-command-element.js
//@require ./element/video-item-element.js
//@require ./element/video-series-label.js
//@require ./element/no-web-component.js
//@require ./element/range-bar-element.js
//@require ./element/dialog-element.js
//@require ./element/setting-panel-element.js

const components = (() => {
  if (self.customElements) {
    if (!customElements.get('futatsume-video-item')) {
      customElements.define('futatsume-video-item', VideoItemElement);
    }
    if (!customElements.get('futatsume-dialog')) {
      customElements.define('futatsume-dialog', DialogElement);
    }
    if (!customElements.get('futatsume-setting-panel')) {
      customElements.define('futatsume-setting-panel', SettingPanelElement);
    }
  }

  return {
    BaseCommandElement,
    VideoItemElement,
    VideoSeriesLabel,
    RangeBarElement,
    DialogElement,
    SettingPanelElement,
  };
})();

//===END===

export { components };
