import { evaluate } from './dev-cdp';
import type { CdpSession } from './dev-cdp';
import { clickVisible } from './dev-ui';

type Check = (session: CdpSession, expression: string, label: string, timeout?: number) => Promise<void>;
export async function verifyCommentInput(session: CdpSession, check: Check): Promise<void> {
  const form = `document.querySelector('.commentInputPanel')`;
  const input = `document.querySelector('.commentInput')`;
  const fixture = 'window.__fwCommentTest';
  // Replace only the submission boundary in this test tab. No public post is sent.
  await evaluate(
    session,
    `(()=>{
    const dialog=window.FutatsumeWatch.debug.dialog;
    const panel=dialog._view.commentInput;
    window.__fwCommentTest={dialog,panel,addChat:dialog.addChat,loggedIn:panel.params.isLoggedIn,autoPause:panel.params.playerConfig.props.autoPauseCommentInput,calls:[]};
    dialog.addChat=(body,commands)=>new Promise((resolve,reject)=>Object.assign(window.__fwCommentTest,{resolve,reject,calls:[...window.__fwCommentTest.calls,{body,commands}]}));
    panel.params.isLoggedIn=true;
    panel.params.playerConfig.props.autoPauseCommentInput=false;
    panel.updateAvailability();
  })()`
  );
  try {
    await session.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 100, y: 160 });
    await clickVisible(session, '[data-comment-palette]');
    await check(session, `!document.querySelector('.commentCommandPalette').hidden`, 'パレットを開く');
    for (const command of ['red', 'big', 'ue']) await clickVisible(session, `[data-comment-command="${command}"]`);
    await check(
      session,
      `document.querySelector('.commandInput').value==='red big ue'`,
      'パレットの色・サイズ・位置を実クリックで選択'
    );
    await clickVisible(session, '.commentInput');
    await session.send('Input.insertText', { text: '投稿テスト' });
    await check(session, `document.querySelector('.commentCount').textContent==='5/75'`, '入力で文字数を更新');
    await Bun.sleep(3200);
    await check(
      session,
      `document.querySelector('.fw-player').dataset.controls==='visible'`,
      'コメント入力中は3秒後も操作バーを保持'
    );
    await session.send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'Enter',
      code: 'Enter',
      windowsVirtualKeyCode: 13,
    });
    await session.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'Enter',
      code: 'Enter',
      windowsVirtualKeyCode: 13,
    });
    await check(
      session,
      `${fixture}.calls.length===1 && ${fixture}.calls[0].body==='投稿テスト' && ${fixture}.calls[0].commands==='red big ue' && ${input}.disabled`,
      'Enter送信を既存投稿経路へ一度だけ渡す'
    );
    await evaluate(session, `${fixture}.reject(new Error('テスト用の送信失敗。再試行してください。'))`);
    await check(
      session,
      `${input}.value==='投稿テスト' && !${input}.disabled && document.querySelector('.commentPostStatus').dataset.state==='error'`,
      '送信失敗で本文を保持し操作可能に戻す'
    );
    await clickVisible(session, '.commentSubmit');
    await check(
      session,
      `${fixture}.calls.length===2 && ${form}.getAttribute('aria-busy')==='true'`,
      '投稿ボタンで再送し送信中を表示'
    );
    await evaluate(session, `${fixture}.resolve()`);
    await check(
      session,
      `${input}.value==='' && !${input}.disabled && document.querySelector('.commandInput').value==='red big ue'`,
      '成功時のみ本文を消しコマンドを保持'
    );
    await clickVisible(session, '[data-comment-palette]');
    await clickVisible(session, '[data-comment-command="reset"]');
    await check(session, `document.querySelector('.commandInput').value===''`, 'パレットのリセット');
    await session.send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'Escape',
      code: 'Escape',
      windowsVirtualKeyCode: 27,
    });
    await session.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'Escape',
      code: 'Escape',
      windowsVirtualKeyCode: 27,
    });
    await check(
      session,
      `document.querySelector('.commentCommandPalette').hidden && document.querySelector('#futatsumeVideoPlayerDialog').classList.contains('is-open')`,
      'Escapeでパレットだけ閉じる'
    );
    await clickVisible(session, '[data-shell-action="fullscreen"]');
    await check(
      session,
      `!!document.fullscreenElement && ${form}.getBoundingClientRect().bottom<innerHeight`,
      '全画面でも投稿フォームを画面内に配置'
    );
    await clickVisible(session, '.commentInput');
    await session.send('Input.insertText', { text: '全画面入力' });
    await check(session, `${input}.value==='全画面入力'`, '全画面でコメントを実入力');
    await clickVisible(session, '[data-shell-action="fullscreen"]');
    for (const [width, height] of [
      [390, 844],
      [640, 480],
      [844, 390],
      [1280, 800],
      [1920, 1080],
      [3840, 2160],
    ]) {
      await session.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
      await clickVisible(session, '.commentInput');
      await check(
        session,
        `['.commentInput','[data-comment-palette]','.commentSubmit','[data-shell-volume]'].every(s=>{const r=document.querySelector(s).getBoundingClientRect();return r.width>0&&r.x>=0&&r.right<=innerWidth+1&&r.y>=0&&r.bottom<innerHeight})`,
        `${width}×${height}で音量と投稿フォームが画面内`
      );
      if (width! > 1000)
        await check(
          session,
          `(()=>{const v=document.querySelector('[data-shell-volume]').getBoundingClientRect(),f=${form}.getBoundingClientRect();return f.x>=v.right&&Math.abs(f.y+f.height/2-v.y-v.height/2)<3})()`,
          `${width}px幅で音量バーのすぐ横に投稿フォーム`
        );
      await clickVisible(session, '[data-comment-palette]');
      await check(
        session,
        `(()=>{const p=document.querySelector('.commentCommandPalette').getBoundingClientRect();return p.width>0&&p.x>=0&&p.right<=innerWidth+1&&p.y>=0&&p.bottom<=document.querySelector('.fw-bottom').getBoundingClientRect().top})()`,
        `${width}×${height}でパレットが再生操作を覆わず画面内`
      );
      await clickVisible(session, '[data-comment-command="blue"]');
      const capture = (await session.send('Page.captureScreenshot', { format: 'png' })) as { data: string };
      await Bun.write(
        new URL(`../dev-assets/verification/comment-form-${width}.png`, import.meta.url),
        Buffer.from(capture.data, 'base64')
      );
      await clickVisible(session, '.commentInput');
      const controls = (await session.send('Page.captureScreenshot', { format: 'png' })) as { data: string };
      await Bun.write(
        new URL(`../dev-assets/verification/comment-form-${width}-controls.png`, import.meta.url),
        Buffer.from(controls.data, 'base64')
      );
    }
  } catch (error) {
    const capture = (await session.send('Page.captureScreenshot', { format: 'png' })) as { data: string };
    await Bun.write(
      new URL('../dev-assets/verification/comment-form-failure.png', import.meta.url),
      Buffer.from(capture.data, 'base64')
    );
    console.log(
      await evaluate(
        session,
        `({hidden:document.querySelector('.commentCommandPalette').hidden,active:document.activeElement?.outerHTML,controls:document.querySelector('.fw-player').dataset.controls})`
      )
    );
    throw error;
  } finally {
    await evaluate(
      session,
      `(()=>{const t=${fixture};t.dialog.addChat=t.addChat;t.panel.params.isLoggedIn=t.loggedIn;t.panel.params.playerConfig.props.autoPauseCommentInput=t.autoPause;t.panel.commands.value='';t.panel.updateSelection();t.panel.reset();delete window.__fwCommentTest})()`
    );
    await session.send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 800,
      deviceScaleFactor: 1,
      mobile: false,
    });
  }
}
