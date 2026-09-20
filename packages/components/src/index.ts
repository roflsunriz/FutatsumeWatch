import { BaseCommandElement } from './element/BaseCommandElement';
import { VideoItemElement } from './element/VideoItemElement';
import { VideoSeriesLabel } from './element/VideoSeriesLabel';
import './element/NoWebComponent';
import { RangeBarElement } from './element/RangeBarElement';
import { DialogElement } from './element/DialogElement';
import { SettingPanelElement } from './element/SettingPanelElement';

//===BEGIN===
//@require ./element/BaseCommandElement.js
//@require ./element/VideoItemElement.js
//@require ./element/VideoSeriesLabel.js
//@require ./element/NoWebComponent.js
//@require ./element/RangeBarElement.js
//@require ./element/DialogElement.js
//@require ./element/SettingPanelElement.js

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
