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
  display: flex; flex-direction: column; position: relative; min-width: 0; min-height: 0;
  width: min(960px, 100%); height: min(720px, 100%); max-width: 100%; max-height: 100%; padding: 0;
  margin: 0; background: #131923; color: #f1f4f9; border: 1px solid #ffffff26;
  border-radius: 14px; box-shadow: 0 24px 80px #0008; overflow: hidden;
}
[data-fw-settings] .fw-modal-heading {
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
  flex-shrink: 0; padding: 14px 20px; border-bottom: 1px solid #ffffff20;
  margin: 0; background: #131923; color: #f1f4f9;
}
[data-fw-settings] .fw-modal-heading h2 { margin: 0; padding: 0; background: transparent; color: inherit; font: 600 18px/1.5 system-ui, sans-serif; text-shadow: none; }
[data-fw-settings] .fw-modal-content .fw-modal-close { display: inline-flex; align-items: center; justify-content: center; min-width: 44px; width: 44px; height: 44px; padding: 0; margin: 0; border: 0; border-radius: 8px; background: #253141; color: #f1f4f9; font: 24px/1 system-ui, sans-serif; cursor: pointer; }
[data-fw-settings] .fw-settings-layout { display: grid; grid-template-columns: 200px minmax(0, 1fr); flex: 1; min-height: 0; }
[data-fw-settings] .fw-settings-sidebar { min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 12px; border-right: 1px solid #ffffff20; background: #101721; scrollbar-width: thin; }
[data-fw-settings] .fw-settings-sidebar button { display: block; width: 100%; min-height: 44px; margin: 0 0 4px; padding: 10px 12px; text-align: start; white-space: normal; overflow-wrap: anywhere; font: inherit; color: #aab4c6; background: transparent; border: 0; border-radius: 8px; cursor: pointer; }
[data-fw-settings] .fw-settings-sidebar button[aria-selected=true] { background: #203d3b; color: #a7ead9; box-shadow: inset 3px 0 #8ddbc7; }
[data-fw-settings] .fw-settings-sidebar button[data-settings-tab=advanced] { margin-top: 16px; }
[data-fw-settings] .fw-settings-sidebar button:disabled { opacity: .4; cursor: default; }
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
[data-fw-settings] .fw-modal-body :is(input[type=checkbox],input[type=radio]) { transform: none; width: 18px; height: 18px; margin: 0 8px 0 0; vertical-align: middle; }
[data-fw-settings] .fw-modal-body input[type=range] { max-width: 100%; }
[data-fw-settings] .fw-modal-body button { position: static; inset: auto; display: inline-flex; align-items: center; justify-content: center; width: auto; min-height: 40px; padding: 8px 16px; margin: 6px 4px; color: #f1f4f9; background: #253141; border: 1px solid #ffffff20; border-radius: 8px; box-shadow: none; transform: none; font-size: 14px; line-height: 1.5; cursor: pointer; }
[data-fw-settings] .fw-modal-content button:hover { background: #33445a; }
[data-fw-settings] .fw-modal-content :focus-visible { outline: 2px solid #8ddbc7; outline-offset: 2px; }
[data-fw-settings] .fw-modal-body :is(.closeButtonContainer,.buttomContainer) { text-align: right; }
[data-fw-settings] .fw-modal-body .import-config-file-select-label { background: #253141; color: #f1f4f9; border: 1px solid #ffffff20; border-radius: 8px; }
@media (max-width: 480px) {
  dialog.fw-settings-dialog[data-fw-settings] { padding: 12px; }
  [data-fw-settings] .fw-modal-heading { padding: 10px 12px; }
  [data-fw-settings] .fw-settings-layout { grid-template-columns: 104px minmax(0, 1fr); }
  [data-fw-settings] .fw-settings-sidebar { padding: 8px 4px; }
  [data-fw-settings] .fw-settings-sidebar button { padding: 8px; font-size: 12px; }
  [data-fw-settings] .fw-modal-body { padding: 12px; }
  [data-fw-settings] .fw-modal-body :is(.control,.config,.speedSelect) { padding: 8px; }
  [data-fw-settings] .fw-modal-body :is(input[type=text],textarea) { width: 100%; }
}
`;

export const SETTINGS_FIELD_THEME = `
:host { display: block; color: #f1f4f9; font: 14px/1.6 system-ui,sans-serif; color-scheme: dark; }
.root { background: #1a2431; color: #f1f4f9; border: 0; border-radius: 8px; padding: 12px; margin-bottom: 12px; white-space: normal; box-sizing: border-box; }
.root label { display: grid; gap: 8px; min-width: 0; max-width: 100%; color: #f1f4f9; background: transparent; text-shadow: none; }
:host(video-debug-checkbox) .root label { display: flex; align-items: center; }
.root .labelText { order: -1; padding: 0; text-align: left; font-family: inherit; }
:host(video-debug-checkbox) .root .labelText { order: 0; }
.root .current-value { color: #8ddbc7; font-variant-numeric: tabular-nums; }
.root :is(.name,.labelText) { color: #f1f4f9; white-space: normal; min-width: 0; overflow-wrap: anywhere; }
.root :is(.details,.detailsText) { color: #bac8da; background: #131923; }
.root input { accent-color: #8ddbc7; color: #f1f4f9; max-width: 100%; }
.root input[type=range] { width: 100%; min-width: 0; appearance: auto; }
.root input[type=range]::after { content: none; }
.root input[type=checkbox] { transform: none; width: 18px; height: 18px; }
.root :focus-visible { outline: 2px solid #8ddbc7; }
`;
