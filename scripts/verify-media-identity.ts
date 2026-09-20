import type { CdpSession } from './dev-cdp';
import { mediaSpec } from '../test/fixtures/functionality/media-spec';
import type { MediaWatchId } from '../test/fixtures/functionality/media-spec';

export type MediaIdentityCheck = (
  session: CdpSession,
  expression: string,
  label: string,
  timeout?: number
) => Promise<void>;

/** API/表示だけが切り替わり、前の映像が残る退行を実デコード画素で検出する。 */
export async function verifyMediaIdentity(
  session: CdpSession,
  id: MediaWatchId,
  check: MediaIdentityCheck
): Promise<void> {
  const spec = mediaSpec[id];
  const thread = String(1173108780 + Object.keys(mediaSpec).indexOf(id));
  await check(
    session,
    `(()=>{
    const debug=window.FutatsumeWatch.debug,wrapper=document.querySelector('futatsume-video'),video=wrapper?.shadowRoot.querySelector('video');
    if(!video||video.readyState<2||debug.videoInfo.watchId!==${JSON.stringify(id)})return false;
    if(debug.videoInfo.duration!==${spec.duration}||Math.abs(video.duration-${spec.duration})>0.5)return false;
    if(![[${spec.low.width},${spec.low.height}],[${spec.high.width},${spec.high.height}]].some(([w,h])=>video.videoWidth===w&&video.videoHeight===h))return false;
    if(!wrapper.src.includes('/${id}/')||String(debug.dialog._threadInfo?.threadId)!==${JSON.stringify(thread)})return false;
    if(debug.playlist._activeItem?.watchId!==${JSON.stringify(id)}||document.querySelector('.fw-title').textContent!==debug.videoInfo.title)return false;
    const canvas=document.createElement('canvas');canvas.width=video.videoWidth;canvas.height=video.videoHeight;
    const ctx=canvas.getContext('2d');ctx.drawImage(video,0,0);
    const pixel=[...ctx.getImageData(Math.floor(canvas.width*.2),Math.floor(canvas.height*.8),1,1).data].slice(0,3);
    return pixel[${spec.channel}]>180&&pixel.every((value,index)=>index===${spec.channel}||value<80);
  })()`,
    `P1-04/media-${id}: ID・長さ・比率・実映像の識別画素・コメント・選択行が一致`,
    30000
  );
}
