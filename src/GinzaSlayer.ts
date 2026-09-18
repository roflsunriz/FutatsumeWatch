import { nicoUtil } from '../packages/lib/src/nico/nicoUtil';
import { uq } from '../packages/lib/src/uQuery';

interface GinzaSlayerOpenOptions {
  currentTime?: number;
}

export interface GinzaSlayerDialog {
  open(watchId: string | null, options: GinzaSlayerOpenOptions): void;
}

export interface GinzaSlayerQuery {
  from?: string | number;
}

interface GinzaSlayerUqResult {
  remove(): void;
}

type GinzaSlayerUq = (selector: string) => GinzaSlayerUqResult;
//===BEGIN===
const initializeGinzaSlayer = (dialog: GinzaSlayerDialog, query: GinzaSlayerQuery): void => {
  (uq as unknown as GinzaSlayerUq)('.notify_update_flash_playerm, #external_nicoplayer').remove();
  const watchId = nicoUtil.getWatchId();
  const options: GinzaSlayerOpenOptions = {};
  if (!isNaN(query.from as number)) {
    // @ts-expect-error parseFloat の第2引数は無視される既存の呼び出し形を温存する
    options.currentTime = parseFloat(query.from as string, 10);
  }

  const v = document.querySelector<HTMLVideoElement>('#MainVideoPlayer video');
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  v && v.pause();
  dialog.open(watchId, options);
};
//===END===

export { initializeGinzaSlayer };
