import { evaluate } from './dev-cdp';
import type { CdpSession } from './dev-cdp';

export async function clickVisible(session: CdpSession, selector: string): Promise<void> {
  const locate = async (): Promise<{ x: number; y: number }> => {
    const point = await evaluate(
      session,
      `(()=>{
      const e=document.querySelector(${JSON.stringify(selector)});
      if(!e || e.disabled)throw new Error('操作できる入口がありません');
      e.scrollIntoView({block:'center',inline:'center'});
      const r=e.getBoundingClientRect(),s=getComputedStyle(e);
      const x=r.left+r.width/2,y=r.top+r.height/2;
      if(r.width<=0||r.height<=0||s.display==='none'||s.visibility!=='visible'||Number(s.opacity)===0||x<0||x>=innerWidth||y<0||y>=innerHeight)throw new Error('入口が画面に表示されていません');
      for(const point of [{x,y},{x:r.left+Math.min(6,r.width/4),y},{x:r.right-Math.min(6,r.width/4),y}]) {
        const hit=document.elementFromPoint(point.x,point.y);
        if(hit&&e.contains(hit))return point;
      }
      throw new Error('入口が別の要素に覆われています');
    })()`
    );
    if (
      typeof point !== 'object' ||
      point === null ||
      !('x' in point) ||
      !('y' in point) ||
      typeof point.x !== 'number' ||
      typeof point.y !== 'number'
    )
      throw new Error('クリック座標が不正です');
    return { x: point.x, y: point.y };
  };
  const deadline = Date.now() + 8000;
  let lastError: Error | undefined;
  while (Date.now() < deadline) {
    try {
      const initial = await locate();
      await session.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...initial });
      await Bun.sleep(150);
      const point = await locate();
      await session.send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point });
      await session.send('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        button: 'left',
        clickCount: 1,
        ...point,
      });
      return;
    } catch (error) {
      if (!(error instanceof Error) || !/入口/.test(error.message)) throw error;
      lastError = error;
      await Bun.sleep(100);
    }
  }
  throw new Error(`画面上の入口をクリックできませんでした: ${lastError?.message ?? '配置が安定しません'}`);
}
