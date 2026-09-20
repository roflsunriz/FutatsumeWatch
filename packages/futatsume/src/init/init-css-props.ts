import { cssUtil } from '../../../lib/src/css/css';
import { CONSTANT } from '../../../../src/constant';
import { global } from '../../../../src/futatsume-watch-index';

interface CssUtilLike {
  s(value: number): unknown;
  px(value: number): unknown;
  number(value: number): unknown;
  registerProps(...props: unknown[]): void;
  setProps(...args: unknown[]): void;
}

interface ConstantLike {
  SIDE_PLAYER_WIDTH: number;
}

interface FutatsumeGlobalLike {
  innerWidth: number;
  innerHeight: number;
}
//===BEGIN===
const initCssProps = (win?: Window): void => {
  const target = win || window;
  const css = cssUtil as unknown as CssUtilLike;
  const constant = CONSTANT as unknown as ConstantLike;
  const futatsumeGlobal = global as unknown as FutatsumeGlobalLike;
  const LEN = '<length>';

  const LP = '<length-percentage>';
  const CL = '<color>';
  const NUM = '<number>';

  const TP = 'transparent';
  const inherits = true;
  css.registerProps(
    // {name: '--inner-width', window: target,
    //   syntax: NUM, initialValue: css.number(100), inherits},
    // {name: '--inner-height', window: target,
    //   syntax: NUM, initialValue: css.number(100), inherits},
    { name: '--futatsume-ui-scale', window: target, syntax: NUM, initialValue: css.number(1), inherits },
    { name: '--futatsume-control-bar-height', window: target, syntax: LEN, initialValue: css.px(48), inherits },
    { name: '--futatsume-comment-layer-opacity', window: target, syntax: NUM, initialValue: css.number(1), inherits },
    {
      name: '--futatsume-comment-panel-header-height',
      window: target,
      syntax: LEN,
      initialValue: css.px(64),
      inherits,
    },
    {
      name: '--sideView-left-margin',
      window: target,
      syntax: LP,
      initialValue: css.px(constant.SIDE_PLAYER_WIDTH + 24),
      inherits,
    },
    { name: '--sideView-top-margin', window: target, syntax: LP, initialValue: css.px(76), inherits },
    // {name: '--current-time', window: target,
    //   syntax: TM,  initialValue: SEC1, inherits},
    // {name: '--scroll-top', window: target,
    //   syntax: LEN, initialValue: PX0,  inherits},
    // {name: '--vpos-time', window: target,
    //   syntax: TM,  initialValue: SEC1, inherits},
    // {name: '--duration', window: target,
    //   syntax: TM,  initialValue: cssUtil.s(4), inherits},
    // {name: '--playback-rate', window: target,
    //   syntax: NUM, initialValue: css.number(1), inherits},
    // {name: '--trans-x-pp', window: target,
    //   syntax: LP, initialValue: PX0, inherits: false},
    // {name: '--trans-y-pp', window: target,
    //   syntax: LP, initialValue: PX0, inherits: false},
    // {name: '--width-pp', window: target,
    //   syntax: LP, initialValue: PX0, inherits},
    // {name: '--height-pp', window: target,
    //   syntax: LP, initialValue: PX0, inherits},
    { name: '--base-bg-color', window: target, syntax: CL, initialValue: TP, inherits },
    { name: '--base-fore-color', window: target, syntax: CL, initialValue: TP, inherits },
    { name: '--light-text-color', window: target, syntax: CL, initialValue: TP, inherits },
    { name: '--scrollbar-bg-color', window: target, syntax: CL, initialValue: TP, inherits },
    { name: '--scrollbar-thumb-color', window: target, syntax: CL, initialValue: TP, inherits },
    { name: '--item-border-color', window: target, syntax: CL, initialValue: TP, inherits },
    { name: '--hatsune-color', window: target, syntax: CL, initialValue: TP, inherits },
    { name: '--enabled-button-color', window: target, syntax: CL, initialValue: TP, inherits }
  );
  css.setProps(
    [document.documentElement, '--inner-width', css.number(futatsumeGlobal.innerWidth)],
    [document.documentElement, '--inner-height', css.number(futatsumeGlobal.innerHeight)]
  );
};

//===END===

export { initCssProps };
