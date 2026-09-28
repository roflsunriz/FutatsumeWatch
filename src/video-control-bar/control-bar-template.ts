import { FutatsumeWatch } from '../app/futatsume-watch-index';
import type { VcbTemplateInfo } from './types';
export const VIDEO_CONTROL_BAR_TEMPLATE = `
    <div class="videoControlBar" data-command="nop">

      <div class="seekBarContainer">
        <div class="seekBarShadow"></div>
        <div class="seekBar">
          <div class="seekBarPointer"></div>
          <div class="bufferRange"></div>
          <div class="progressWave"></div>
          <input type="range" class="seekRange" min="0" step="any">
          <canvas width="200" height="10" class="heatMap futatsumeHeatMap"></canvas>
        </div>
        <futatsume-seekbar-label class="resumePointer" data-command="seekTo" data-text="ここまで見た"></futatsume-seekbar-label>
        <futatsume-seekbar-label class="resumePointer" data-command="seekTo" data-text="ここまで見た"></futatsume-seekbar-label>
        <futatsume-seekbar-label class="resumePointer" data-command="seekTo" data-text="ここまで見た"></futatsume-seekbar-label>
        <futatsume-seekbar-label class="resumePointer" data-command="seekTo" data-text="ここまで見た"></futatsume-seekbar-label>
        <futatsume-seekbar-label class="resumePointer" data-command="seekTo" data-text="ここまで見た"></futatsume-seekbar-label>
      </div>

      <div class="controlItemContainer left">
        <div class="scalingUI">
          <div class="FutatsumeWatchVer" data-env="${(FutatsumeWatch as unknown as VcbTemplateInfo).env}">ver ${(FutatsumeWatch as unknown as VcbTemplateInfo).version}${(FutatsumeWatch as unknown as VcbTemplateInfo).env === 'DEV' ? '(Dev)' : ''}</div>
        </div>
      </div>
      <div class="controlItemContainer center">
        <div class="scalingUI">
          <div class="seekBarContainer-mainControl">
            <div class="prevVideo controlButton playControl" data-command="playPreviousVideo" data-param="0">
              <div class="controlButtonInner">&#x27A0;</div>
              <div class="tooltip">前の動画</div>
            </div>

            <div class="toggleStoryboard controlButton playControl forPremium" data-command="toggleStoryboard">
              <div class="controlButtonInner"></div>
              <div class="tooltip">シーンサーチ</div>
            </div>

            <div class="loopSwitch controlButton playControl" data-command="toggle-loop">
              <div class="controlButtonInner">&#8635;</div>
              <div class="tooltip">リピート</div>
            </div>

            <div class="seekTop controlButton playControl" data-command="seek" data-param="0">
              <div class="controlButtonInner">&#8676;</div>
              <div class="tooltip">先頭</div>
            </div>

            <div class="togglePlay controlButton playControl" data-command="togglePlay">
              <span class="pause"></span>
              <span class="play">▶</span>
            </div>

            <div class="playbackRateMenu controlButton" tabindex="-1" data-has-submenu="1">
              <div class="controlButtonInner"></div>
              <div class="tooltip">再生速度</div>
              <div class="playbackRateSelectMenu futatsumePopupMenu futatsumeSubMenu">
                <div class="triangle"></div>
                <p class="caption">再生速度</p>
                <ul>
                  <li class="playbackRate" data-command="playbackRate" data-param="10"><span>10倍</span></li>
                  <li class="playbackRate" data-command="playbackRate" data-param="5"  ><span>5倍</span></li>
                  <li class="playbackRate" data-command="playbackRate" data-param="4"  ><span>4倍</span></li>
                  <li class="playbackRate" data-command="playbackRate" data-param="3"  ><span>3倍</span></li>
                  <li class="playbackRate" data-command="playbackRate" data-param="2"  ><span>2倍</span></li>

                  <li class="playbackRate" data-command="playbackRate" data-param="1.75"><span>1.75倍</span></li>
                  <li class="playbackRate" data-command="playbackRate" data-param="1.5"><span>1.5倍</span></li>
                  <li class="playbackRate" data-command="playbackRate" data-param="1.25"><span>1.25倍</span></li>

                  <li class="playbackRate" data-command="playbackRate" data-param="1.0"><span>標準速度(x1)</span></li>
                  <li class="playbackRate" data-command="playbackRate" data-param="0.75"><span>0.75倍</span></li>
                  <li class="playbackRate" data-command="playbackRate" data-param="0.5"><span>0.5倍</span></li>
                  <li class="playbackRate" data-command="playbackRate" data-param="0.25"><span>0.25倍</span></li>
                  <li class="playbackRate" data-command="playbackRate" data-param="0.1"><span>0.1倍</span></li>
                </ul>
              </div>
            </div>

            <div class="videoTime">
              <span class="currentTimeLabel"></span>/<span class="durationLabel"></span>
            </div>

            <div class="muteSwitch controlButton" data-command="toggle-mute">
              <div class="tooltip">ミュート(M)</div>
              <div class="menuButtonInner mute-off">&#x1F50A;</div>
              <div class="menuButtonInner mute-on">&#x1F507;</div>
            </div>

            <div class="volumeControl">
              <futatsume-range-bar><input class="volumeRange" type="range" value="0.5" min="0.01" max="1" step="any"></futatsume-range-bar>
            </div>

            <div class="nextVideo controlButton playControl" data-command="playNextVideo" data-param="0">
              <div class="controlButtonInner">&#x27A0;</div>
              <div class="tooltip">次の動画</div>
            </div>

          </div>
        </div>
      </div>

      <div class="controlItemContainer right">

        <div class="scalingUI">

          <div class="videoQualityMenu controlButton forYouTube" data-command="reload" title="FutatsumeTube解除">
            <div class="controlButtonInner">画</div>
          </div>
          <div class="videoQualityMenu controlButton" tabindex="-1" data-has-submenu="1">
            <div class="controlButtonInner">画</div>

            <div class="tooltip">画質</div>
            <div class="videoQualitySelectMenu futatsumePopupMenu futatsumeSubMenu">
              <div class="triangle"></div>
              <p class="caption">画質</p>
              <ul>
                <li class="selected">
                  <p class="currentVideoQuality"></p>
                  <ul class="domandVideoQuality">
                    <li class="select-domand-auto"  data-command="update-domandVideoQuality" data-param="auto"><span>自動(auto)</span><//li>
                    <li class="select-domand-1080p" data-command="update-domandVideoQuality" data-param="1080p"><span>1080p 優先</span><//li>
                    <li class="select-domand-720p"  data-command="update-domandVideoQuality" data-param="720p"><span>720p</span><//li>
                    <li class="select-domand-480p"  data-command="update-domandVideoQuality" data-param="480p"><span>480p</span><//li>
                    <li class="select-domand-360p"  data-command="update-domandVideoQuality" data-param="360p"><span>360p</span><//li>
                    <li class="select-domand-144p"  data-command="update-domandVideoQuality" data-param="144p"><span>144p</span><//li>
                  </ul>
                </li>
             </ul>
            </div>
          </div>

          <div class="screenModeMenu controlButton" tabindex="-1" data-has-submenu="1">
            <div class="tooltip">画面サイズ・モード変更</div>
            <div class="controlButtonInner">&#9114;</div>
            <div class="screenModeSelectMenu futatsumePopupMenu futatsumeSubMenu">
              <div class="triangle"></div>
              <p class="caption">画面モード</p>
              <ul>
                <li class="screenMode mode3D"   data-command="screenMode" data-param="3D"><span>3D</span></li>
                <li class="screenMode small"    data-command="screenMode" data-param="small"><span>小</span></li>
                <li class="screenMode sideView" data-command="screenMode" data-param="sideView"><span>横</span></li>
                <li class="screenMode normal"   data-command="screenMode" data-param="normal"><span>中</span></li>
                <li class="screenMode wide"     data-command="screenMode" data-param="wide"><span>WIDE</span></li>
                <li class="screenMode big"      data-command="screenMode" data-param="big"><span>大</span></li>
              </ul>
            </div>
          </div>

          <div class="fullscreenControlBarModeMenu controlButton" tabindex="-1" data-has-submenu="1">
            <div class="tooltip">ツールバーの表示</div>
            <div class="controlButtonInner">&#128204;</div>
            <div class="fullscreenControlBarModeSelectMenu futatsumePopupMenu futatsumeSubMenu">
              <div class="triangle"></div>
              <p class="caption">ツールバーの表示</p>
              <ul>
                <li tabindex="-1" data-command="update-fullscreenControlBarMode" data-param="always-show"><span>常に固定</span></li>
                <li tabindex="-1" data-command="update-fullscreenControlBarMode" data-param="always-hide"><span>常に隠す</span></li>
                <li tabindex="-1" data-command="update-fullscreenControlBarMode" data-param="auto"><span>画面サイズ自動</span></li>
              </ul>
            </div>
          </div>

          <div class="fullscreenSwitch controlButton" data-command="fullscreen">
            <div class="tooltip">フルスクリーン(F)</div>
            <div class="controlButtonInner">
              <!-- TODO: YouTubeと同じにする -->
              <span class="toFull">&#8690;</span>
              <span class="returnFull">&#8689;</span>
            </div>
          </div>

          <div class="settingPanelSwitch controlButton" data-command="settingPanel">
            <div class="controlButtonInner">&#x2699;</div>
            <div class="tooltip">設定</div>
          </div>

        </div>
      </div>

    </div>
  `.trim();
