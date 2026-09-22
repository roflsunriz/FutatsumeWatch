export const SETTINGS_DIALOG_THEME = `
dialog.fw-settings-dialog[data-fw-settings] {
  position: fixed; inset: 0; margin: 0; padding: 16px;
  width: 100vw; height: 100dvh; max-width: none; max-height: none;
  box-sizing: border-box; border: 0; border-radius: 0; background: transparent;
  color: #f1f4f9; box-shadow: none; text-shadow: none;
  transform: none; transition: none; animation: none;
  visibility: visible; opacity: 1; overflow: hidden;
  font: 14px/1.6 system-ui, sans-serif; color-scheme: dark;
}
dialog.fw-settings-dialog[data-fw-settings]:not([open]) { display: none; }
dialog.fw-settings-dialog[data-fw-settings][open] { display: grid; place-items: center; }
dialog.fw-settings-dialog[data-fw-settings]::before { content: none; display: none; }
dialog.fw-settings-dialog[data-fw-settings]::backdrop { background: #060a1280; backdrop-filter: blur(12px); }
dialog.fw-settings-dialog[data-fw-settings] * { box-sizing: border-box; }
dialog.fw-settings-dialog[data-fw-settings] > .fw-modal-content {
  display: block; position: relative; min-width: 0; min-height: 0;
  width: 100%; height: 100%; max-width: 100%; max-height: 100%; padding: 0;
  margin: 0; background: #131923; color: #f1f4f9; border: 1px solid #ffffff26;
  border-radius: 12px; box-shadow: 0 24px 80px #0008; overflow: hidden;
}
[data-fw-settings] .fw-settings-main { display: flex; flex-direction: column; min-width: 0; min-height: 0; background: #131923e8; }
[data-fw-settings] .fw-modal-heading {
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
  flex-shrink: 0; padding: 14px 20px; border-bottom: 1px solid #ffffff20;
  margin: 0; background: #131923; color: #f1f4f9;
}
[data-fw-settings] .fw-modal-heading h2 { margin: 0; padding: 0; background: transparent; color: inherit; font: 600 18px/1.5 system-ui, sans-serif; text-shadow: none; }
[data-fw-settings] .fw-modal-content .fw-modal-close { display: inline-flex; align-items: center; justify-content: center; min-width: 44px; width: 44px; height: 44px; padding: 0; margin: 0; border: 0; border-radius: 8px; background: #253141; color: #f1f4f9; font: 24px/1 system-ui, sans-serif; cursor: pointer; }
[data-fw-settings] .fw-settings-layout { display: grid; grid-template-columns: clamp(180px,26%,280px) minmax(0, 1fr); width: 100%; height: 100%; min-height: 0; }
[data-fw-settings] .fw-settings-sidebar { min-height: 0; overflow-x: hidden; overflow-y: auto; overscroll-behavior: contain; padding: 12px; border-right: 1px solid #ffffff20; background: #101721; scrollbar-width: thin; }
[data-fw-settings] .fw-settings-brand { display: flex; align-items: center; gap: 10px; min-height: 58px; margin: 0 0 14px; padding: 8px 10px 14px; border-bottom: 1px solid #ffffff20; color: #f1f4f9; }
[data-fw-settings] .fw-settings-brand-mark { font-size: 22px; color: #8ddbc7; }
[data-fw-settings] .fw-settings-brand strong,[data-fw-settings] .fw-settings-brand small { display: block; overflow-wrap: anywhere; }
[data-fw-settings] .fw-settings-brand small { margin-top: 2px; color: #aab4c6; font-size: 12px; }
[data-fw-settings] .fw-settings-sidebar button { display: block; width: 100%; min-height: 44px; margin: 0 0 4px; padding: 10px 12px; text-align: start; white-space: normal; overflow-wrap: anywhere; font: inherit; color: #aab4c6; background: transparent; border: 0; border-radius: 8px; cursor: pointer; }
[data-fw-settings] .fw-settings-sidebar button[aria-selected=true] { background: #203d3b; color: #a7ead9; box-shadow: inset 3px 0 #8ddbc7; }
[data-fw-settings] .fw-settings-sidebar button[data-settings-tab=advanced] { margin-top: 16px; }
[data-fw-settings] .fw-settings-sidebar button:disabled { opacity: .4; cursor: default; }
[data-fw-settings] .fw-settings-sidebar-extras { margin-top: 16px; padding-top: 16px; border-top: 1px solid #ffffff20; }
[data-fw-settings] .fw-settings-utilities { display: grid; gap: 4px; }
[data-fw-settings] .fw-settings-utilities :is(.fw-quality,a,button) { display: flex; align-items: center; justify-content: space-between; width: 100%; min-height: 44px; margin: 0; padding: 9px 10px; border: 0; border-radius: 8px; color: #f1f4f9; background: transparent; text-align: start; text-decoration: none; overflow-wrap: anywhere; font: inherit; cursor: pointer; }
[data-fw-settings] .fw-settings-utilities :is(a,button):hover { background: #ffffff12; }
[data-fw-settings] .fw-settings-utilities .fw-quality { cursor: default; }
[data-fw-settings] .fw-settings-utilities select { min-width: 0; max-width: 58%; padding: 6px; border: 1px solid #526173; border-radius: 6px; color: #f1f4f9; background: #0d141f; font: inherit; }
[data-fw-settings] .fw-settings-actions { display: grid; gap: 4px; padding-top: 12px; margin-top: 8px; border-top: 1px solid #ffffff18; }
[data-fw-settings] .fw-modal-body { min-width: 0; min-height: 0; overflow: auto; overflow-wrap: anywhere; overscroll-behavior: contain; padding: 20px; scrollbar-width: thin; scrollbar-color: #526173 #131923; }
[data-fw-settings] [data-settings-section][hidden] { display: none; }
[data-fw-settings] .fw-modal-body :is(.title,.setting-heading) { display: none; }
[data-fw-settings] .fw-modal-body :is(.dialogInner,.settingPanelInner) { margin: 0; padding: 0; height: auto; border: 0; overflow: visible; }
[data-fw-settings] .fw-modal-body :is(h3,h4,.caption) { color: #f1f4f9; background: #253141; border: 0; border-radius: 8px; text-shadow: none; padding: 10px 12px; font-size: 15px; font-weight: 600; line-height: 1.5; }
[data-fw-settings] .fw-modal-body :is(.control,.config,.speedSelect,.enableSelect,.needFocusSelect,.deviceIndex,.minDuration,.ignoreTags) { margin: 0 0 12px; padding: 12px; border-radius: 8px; background: #1a2431; color: #f1f4f9; }
[data-fw-settings] .fw-modal-body :is(.speedSelect,.deviceIndex,.minDuration) { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; justify-content: space-between; }
[data-fw-settings] .fw-modal-body label { max-width: 100%; padding: 6px; margin: 0; border: 0; border-radius: 6px; line-height: 1.7; white-space: normal; cursor: pointer; }
[data-fw-settings] .fw-modal-body label:hover { background: #ffffff0b; }
[data-fw-settings] .fw-modal-body :is(.name,.labelText) { min-width: 0; max-width: 100%; white-space: normal; }
[data-fw-settings] .fw-modal-body a { color: #8ddbc7; }
[data-fw-settings] .fw-modal-body :is(input,select,textarea,button) { max-width: 100%; font: inherit; color: #f1f4f9; accent-color: #8ddbc7; }
[data-fw-settings] .fw-modal-body :is(input[type=text],input[type=number],input[type=datetime-local],select,textarea) { background: #101721; border: 1px solid #526173; border-radius: 6px; padding: 8px; margin: 4px 0; font-size: 14px; min-width: 0; }
[data-fw-settings] .fw-modal-body textarea { width: 100%; min-height: 100px; }
[data-fw-settings] .fw-modal-body label:has(input[type=checkbox]) { display: flex; align-items: center; gap: 12px; }
[data-fw-settings] .fw-modal-body input[type=checkbox] { appearance: none; order: 2; position: relative; flex: 0 0 auto; width: 50px; height: 28px; margin: 0 0 0 auto; border: 1px solid #b8c0c8; border-radius: 999px; background: linear-gradient(180deg,#9aa3ab 0%,#646d75 48%,#4b535a 52%,#727b83 100%); box-shadow: inset 0 2px 4px #0008,inset 0 -1px 2px #fff5,0 1px 2px #0008; cursor: pointer; transition: background 140ms ease,box-shadow 140ms ease; }
[data-fw-settings] .fw-modal-body input[type=checkbox]::after { content: ''; position: absolute; top: 2px; left: 2px; width: 22px; height: 22px; border: 1px solid #d9dee2; border-radius: 50%; background: linear-gradient(145deg,#f4f6f7 0%,#aeb6bd 48%,#737c84 100%); box-shadow: 0 2px 4px #0009,inset 0 1px 1px #fff; transition: transform 140ms ease; }
[data-fw-settings] .fw-modal-body input[type=checkbox]:checked { background: linear-gradient(180deg,#66d99a 0%,#2da66a 48%,#19784a 52%,#2d9c63 100%); box-shadow: inset 0 2px 4px #063a2388,inset 0 -1px 2px #b5ffd48a,0 0 0 1px #41c98255; }
[data-fw-settings] .fw-modal-body input[type=checkbox]:checked::after { transform: translateX(22px); }
[data-fw-settings] .fw-modal-body input[type=checkbox]:disabled { opacity: .5; cursor: not-allowed; }
[data-fw-settings] .fw-modal-body input[type=radio] { transform: none; width: 18px; height: 18px; margin: 0 8px 0 0; vertical-align: middle; }
[data-fw-settings] .fw-modal-body input[type=range] { max-width: 100%; }
[data-fw-settings] .fw-modal-body button { position: static; inset: auto; display: inline-flex; align-items: center; justify-content: center; width: auto; min-height: 40px; padding: 8px 16px; margin: 6px 4px; color: #f1f4f9; background: #253141; border: 1px solid #ffffff20; border-radius: 8px; box-shadow: none; transform: none; font-size: 14px; line-height: 1.5; cursor: pointer; }
[data-fw-settings] .fw-modal-content button:hover { background: #33445a; }
[data-fw-settings] .fw-modal-content :focus-visible { outline: 2px solid #8ddbc7; outline-offset: 2px; }
[data-fw-settings] .fw-modal-body :is(.closeButtonContainer,.buttomContainer) { text-align: right; }
[data-fw-settings] .fw-modal-body .import-config-file-select-label { background: #253141; color: #f1f4f9; border: 1px solid #ffffff20; border-radius: 8px; }
@media (max-width: 480px) {
  dialog.fw-settings-dialog[data-fw-settings] { padding: 6px; }
  [data-fw-settings] .fw-modal-heading { padding: 10px 12px; }
  [data-fw-settings] .fw-settings-layout { grid-template-columns: 116px minmax(0, 1fr); }
  [data-fw-settings] .fw-settings-sidebar { padding: 8px 4px; }
  [data-fw-settings] .fw-settings-brand { gap: 0; padding-inline: 4px; }
  [data-fw-settings] .fw-settings-brand-mark { display: none; }
  [data-fw-settings] .fw-settings-brand strong { font-size: 11px; }
  [data-fw-settings] .fw-settings-brand small { font-size: 10px; }
  [data-fw-settings] .fw-settings-sidebar button { padding: 8px; font-size: 12px; }
  [data-fw-settings] .fw-modal-body { padding: 12px; }
  [data-fw-settings] .fw-modal-body :is(.control,.config,.speedSelect) { padding: 8px; }
  [data-fw-settings] .fw-modal-body :is(input[type=text],textarea) { width: 100%; }
  [data-fw-settings] .fw-modal-body input[type=checkbox] { width: 44px; height: 24px; }
  [data-fw-settings] .fw-modal-body input[type=checkbox]::after { width: 18px; height: 18px; }
  [data-fw-settings] .fw-modal-body input[type=checkbox]:checked::after { transform: translateX(20px); }
}
`;

export const SETTINGS_FIELD_THEME = `
:host { display: block; color: #f1f4f9; font: 14px/1.6 system-ui,sans-serif; color-scheme: dark; }
.root { background: #1a2431; color: #f1f4f9; border: 0; border-radius: 8px; padding: 12px; margin-bottom: 12px; white-space: normal; box-sizing: border-box; }
.root label { display: grid; gap: 8px; min-width: 0; max-width: 100%; color: #f1f4f9; background: transparent; text-shadow: none; }
:host(video-debug-checkbox) .root label { display: flex; align-items: center; gap: 12px; }
.root .labelText { order: -1; padding: 0; text-align: left; font-family: inherit; }
:host(video-debug-checkbox) .root .labelText { order: 0; }
.root .current-value { color: #8ddbc7; font-variant-numeric: tabular-nums; }
.root :is(.name,.labelText) { color: #f1f4f9; white-space: normal; min-width: 0; overflow-wrap: anywhere; }
.root :is(.details,.detailsText) { color: #bac8da; background: #131923; }
.root input { accent-color: #8ddbc7; color: #f1f4f9; max-width: 100%; }
.root input[type=range] { width: 100%; min-width: 0; appearance: auto; }
.root input[type=range]::after { content: none; }
.root input[type=checkbox] { appearance: none; order: 2; position: relative; flex: 0 0 auto; width: 50px; height: 28px; margin-inline-start: auto; border: 1px solid #b8c0c8; border-radius: 999px; background: linear-gradient(180deg,#9aa3ab,#4b535a 52%,#727b83); box-shadow: inset 0 2px 4px #0008,inset 0 -1px 2px #fff5,0 1px 2px #0008; cursor: pointer; }
.root input[type=checkbox]::after { content: ''; position: absolute; top: 2px; left: 2px; width: 22px; height: 22px; border: 1px solid #d9dee2; border-radius: 50%; background: linear-gradient(145deg,#f4f6f7,#aeb6bd 48%,#737c84); box-shadow: 0 2px 4px #0009,inset 0 1px 1px #fff; transition: transform 140ms ease; }
.root input[type=checkbox]:checked { background: linear-gradient(180deg,#66d99a,#2da66a 48%,#19784a 52%,#2d9c63); }
.root input[type=checkbox]:checked::after { transform: translateX(22px); }
.root :focus-visible { outline: 2px solid #8ddbc7; }
`;
