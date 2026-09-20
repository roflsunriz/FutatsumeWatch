import type { RendererSettings } from 'comment-overlay';
import engineSource from '../node_modules/comment-overlay/dist/comment-overlay.es.js?raw';
import engineLicense from '../node_modules/comment-overlay/LICENSE?raw';
import { overlayEntry, commentPresentation, decorateOverlayComment } from './comment-overlay-data';
import type { NicoChatType } from '../packages/futatsume/src/commentLayer/NicoChat';
import { installCommentDurations } from './comment-overlay-timing';

const safeJson = (value: object): string => JSON.stringify(value).replaceAll('<', '\\u003c');

export function exportCommentHtml(chats: NicoChatType[], settings: RendererSettings, duration: number): string {
  const entries = chats.map(overlayEntry);
  const presentations = Object.fromEntries(chats.map((chat) => [chat.id, commentPresentation(chat)]));
  const end =
    Number.isFinite(duration) && duration > 0
      ? duration
      : Math.max(1, ...entries.map((entry) => entry.vposMs / 1000 + 5));
  // npmの実エンジンを同梱するので、保存後も外部通信なしで再生・シークできる。
  return `<!doctype html><html lang="ja"><meta charset="utf-8"><title>FutatsumeWatch コメント</title>
<style>body{margin:0;background:#222;color:white;font:16px sans-serif}#overlay{position:relative;width:100%;height:calc(100vh - 48px)}footer{height:48px;display:flex;align-items:center;gap:12px}input{flex:1}</style>
<div id="overlay"></div><footer><button id="play">再生 / 停止</button><input id="seek" aria-label="再生位置" type="range" min="0" max="${end}" step="0.01"></footer>
<script type="module">
const source = ${safeJson({ code: `/*!\n${engineLicense}\n*/\n${engineSource}` })};
const url = URL.createObjectURL(new Blob([source.code], {type:'text/javascript'}));
const {CommentRenderer} = await import(url); URL.revokeObjectURL(url);
const video=document.createElement('video'), container=document.querySelector('#overlay'), seek=document.querySelector('#seek');
let time=0, paused=true, previous=performance.now();
Object.defineProperties(video,{currentTime:{get:()=>time},duration:{get:()=>${end}},paused:{get:()=>paused}});
video.getBoundingClientRect=()=>container.getBoundingClientRect();
const renderer=new CommentRenderer(${safeJson(settings)}); renderer.initialize({video,container});
const decorate = (${decorateOverlayComment.toString()});
const durations = (${installCommentDurations.toString()})(renderer);
const presentations = ${safeJson(presentations)};
for (const comment of renderer.addComments(${safeJson(entries)})) {
  const presentation=presentations[comment.meta.source];
  decorate(comment,presentation,renderer);
  if(presentation.duration!==null)durations.set(comment,presentation.duration);
}
document.querySelector('#play').onclick=()=>{paused=!paused;video.dispatchEvent(new Event(paused?'pause':'play'));};
seek.oninput=()=>{time=Number(seek.value);renderer.performInitialSync();renderer.draw();};
function tick(now){if(!paused){time=Math.min(${end},time+(now-previous)/1000);seek.value=String(time);if(time>=${end}){paused=true;video.dispatchEvent(new Event('pause'));}}previous=now;requestAnimationFrame(tick);}requestAnimationFrame(tick);
</script></html>`;
}

export function exportCommentXml(chats: NicoChatType[]): string {
  const doc = document.implementation.createDocument(null, 'packet');
  for (const chat of chats) {
    const element = doc.createElement('chat');
    for (const [name, value] of Object.entries({
      vpos: chat.vpos,
      mail: chat.cmd,
      no: chat.no,
      fork: chat.fork,
      thread: chat.threadId,
      user_id: chat.userId,
      date: chat.date,
    })) {
      if (typeof value === 'string' || typeof value === 'number') element.setAttribute(name, String(value));
    }
    element.textContent = chat.text;
    doc.documentElement.append(element);
  }
  return new XMLSerializer().serializeToString(doc);
}
