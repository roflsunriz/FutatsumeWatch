export const MYLIST_MANAGER_STYLE = `
dialog.fw-mylist-manager[data-mylist-manager] {
  position: fixed; inset: 0; display: none; place-items: center;
  box-sizing: border-box; width: 100vw; height: 100dvh;
  max-width: none; max-height: none; margin: 0; padding: 16px;
  border: 0; border-radius: 0; background: transparent;
  color: #f1f4f9; color-scheme: dark; box-shadow: none;
  transform: none; overflow: hidden; font: 14px/1.5 system-ui,sans-serif;
}
dialog.fw-mylist-manager[data-mylist-manager][open] { display: grid; }
dialog.fw-mylist-manager[data-mylist-manager]::backdrop {
  background: #050a12b8; backdrop-filter: blur(10px);
}
.fw-mylist-manager * { box-sizing: border-box; }
.fw-mylist-manager .fw-mylist-card {
  display: flex; flex-direction: column; min-width: 0; min-height: 0;
  width: min(780px,100%); min-height: min(420px,100%); max-height: min(660px,100%);
  margin: 0; padding: 0; overflow: hidden; background: #151d29;
  border: 1px solid #ffffff26; border-radius: 14px;
  box-shadow: 0 24px 80px #000a;
}
.fw-mylist-manager .fw-mylist-header {
  display: flex; align-items: center; justify-content: space-between;
  gap: 16px; flex: 0 0 auto; min-height: 74px;
  padding: 12px 18px 12px 22px; border-bottom: 1px solid #ffffff1d;
  background: #192331;
}
.fw-mylist-manager .fw-mylist-header h2 {
  margin: 0; color: #f1f4f9; font: 650 20px/1.25 system-ui,sans-serif;
}
.fw-mylist-manager .fw-mylist-target {
  margin: 4px 0 0; color: #aebdcf; font-size: 12px; letter-spacing: .02em;
}
.fw-mylist-manager button {
  position: static; display: inline-flex; align-items: center; justify-content: center;
  min-height: 38px; max-width: 100%; margin: 0; padding: 8px 13px;
  border: 1px solid #ffffff28; border-radius: 8px;
  background: #273548; color: #eef3fa;
  font: 500 13px/1.35 system-ui,sans-serif; text-align: center;
  cursor: pointer; box-shadow: none; transform: none;
}
.fw-mylist-manager button:hover { background: #33475d; }
.fw-mylist-manager button:active { background: #3e566d; }
.fw-mylist-manager button:disabled { opacity: .55; cursor: wait; }
.fw-mylist-manager :is(button,input,textarea):focus-visible {
  outline: 2px solid #85dcc6; outline-offset: 2px;
}
.fw-mylist-manager .fw-mylist-icon-button {
  width: 44px; min-width: 44px; min-height: 44px; padding: 0; font-size: 21px;
  background: transparent; border-color: transparent;
}
.fw-mylist-manager .fw-mylist-icon-button:hover { background: #ffffff18; }
.fw-mylist-manager [role=status] {
  flex: 0 0 auto; margin: 0; padding: 8px 20px;
  border-bottom: 1px solid #ffffff1d;
  color: #b8e7d9; font-size: 13px; overflow-wrap: anywhere;
}
.fw-mylist-manager [role=status]:empty { display: none; }
.fw-mylist-manager [role=status][data-state=error] { color: #ffaaa9; }
.fw-mylist-manager [data-layout] {
  display: grid; grid-template-columns: 220px minmax(0,1fr);
  flex: 1 1 auto; min-height: 0;
}
.fw-mylist-manager .fw-mylist-sidebar {
  display: flex; flex-direction: column; min-height: 0;
  padding: 14px 10px; border-right: 1px solid #ffffff1d;
  background: #111924;
}
.fw-mylist-manager .fw-mylist-sidebar-header {
  display: flex; align-items: center; justify-content: space-between;
  gap: 8px; padding: 0 5px 10px;
  color: #aebdcf; font-size: 12px; font-weight: 650;
}
.fw-mylist-manager [data-lists] {
  display: flex; flex-direction: column; gap: 3px;
  flex: 1 1 auto; min-height: 0; overflow: auto;
  scrollbar-width: thin; overscroll-behavior: contain;
}
.fw-mylist-manager [data-lists] button {
  justify-content: flex-start; flex: 0 0 auto; min-height: 42px;
  width: 100%; padding: 9px 11px; border: 0;
  background: transparent; text-align: left;
  overflow-wrap: anywhere; font-weight: 500;
}
.fw-mylist-manager [data-lists] button:hover { background: #ffffff12; }
.fw-mylist-manager [data-lists] button[aria-current=true] {
  background: #214d50; color: #d5fff2; box-shadow: inset 3px 0 #82d8c0;
}
.fw-mylist-manager [data-create-mylist] {
  flex: 0 0 auto; width: 100%; min-height: 42px; margin-top: 10px;
  border: 1px solid #587d7a; background: #1b3034; color: #b7eee0;
}
.fw-mylist-manager [data-create-mylist]:hover { background: #244447; }
.fw-mylist-manager [data-detail] {
  min-width: 0; min-height: 0; overflow: auto;
  padding: 20px 24px 24px; scrollbar-width: thin;
  overscroll-behavior: contain;
}
.fw-mylist-manager .fw-mylist-detail-head {
  display: flex; align-items: center; justify-content: space-between;
  gap: 12px; flex-wrap: wrap; margin: 0 0 22px;
}
.fw-mylist-manager .fw-mylist-detail-head h3 {
  min-width: 0; margin: 0; color: #f1f4f9;
  font: 650 19px/1.35 system-ui,sans-serif;
  overflow-wrap: anywhere;
}
.fw-mylist-manager .fw-mylist-detail-head small {
  display: block; margin-bottom: 3px; color: #94a9ba;
  font-size: 11px; letter-spacing: .08em;
}
.fw-mylist-manager :is([data-mylist-action=add],[data-mylist-action=create],[data-add-watch-later]) {
  border-color: #8ce3c9; background: #7bd9bd; color: #09231d;
  font-weight: 700;
}
.fw-mylist-manager :is([data-mylist-action=add],[data-mylist-action=create],[data-add-watch-later]):hover {
  background: #9aead3;
}
.fw-mylist-manager .fw-mylist-section-heading {
  margin: 22px 0 12px; padding-top: 18px; border-top: 1px solid #ffffff1d;
  color: #dce7f2; font: 650 14px/1.4 system-ui,sans-serif;
}
.fw-mylist-manager [data-detail] label {
  display: grid; gap: 6px; margin: 0 0 14px;
  color: #b9c9d8; font-size: 13px; font-weight: 550;
}
.fw-mylist-manager [data-detail] label:has([type=checkbox]) {
  display: flex; align-items: center; justify-content: space-between;
  gap: 12px; width: min(190px,100%);
}
.fw-mylist-manager [data-detail] input[type=text],
.fw-mylist-manager [data-detail] textarea {
  width: 100%; min-width: 0; padding: 10px 11px; margin: 0;
  border: 1px solid #506073; border-radius: 8px;
  background: #0d1520; color: #f1f4f9; font: inherit;
}
.fw-mylist-manager [data-detail] textarea { min-height: 78px; resize: vertical; }
.fw-mylist-manager [data-detail] input[type=checkbox] {
  appearance: none; position: relative; flex: 0 0 auto;
  width: 42px; height: 24px; margin: 0;
  border: 1px solid #84919f; border-radius: 999px;
  background: #536272; cursor: pointer;
}
.fw-mylist-manager [data-detail] input[type=checkbox]::after {
  content: ''; position: absolute; top: 2px; left: 2px;
  width: 18px; height: 18px; border-radius: 50%;
  background: #f1f4f9; box-shadow: 0 1px 3px #0008;
  transition: transform 140ms ease;
}
.fw-mylist-manager [data-detail] input[type=checkbox]:checked {
  border-color: #7bd9bd; background: #318f75;
}
.fw-mylist-manager [data-detail] input[type=checkbox]:checked::after {
  transform: translateX(18px);
}
.fw-mylist-manager .fw-mylist-form-actions {
  display: flex; gap: 8px; flex-wrap: wrap; margin-top: 16px;
}
.fw-mylist-manager [data-items] { display: grid; gap: 8px; }
.fw-mylist-manager [data-item] {
  min-width: 0; padding: 12px; border: 1px solid #ffffff20;
  border-radius: 9px; background: #1b2836; overflow-wrap: anywhere;
}
.fw-mylist-manager [data-item] > div:first-child {
  color: #e8f0f7; font-weight: 600; margin-bottom: 10px;
}
.fw-mylist-manager [data-item] textarea { min-height: 56px; }
.fw-mylist-manager [data-item] button { margin-right: 8px; }
.fw-mylist-manager :is([data-mylist-action=remove],[data-mylist-action=remove-item]) {
  border-color: #a55c64; color: #ffb8bb; background: transparent;
}
.fw-mylist-manager :is([data-mylist-action=remove],[data-mylist-action=remove-item]):hover {
  background: #5b3039;
}
.fw-mylist-manager .fw-mylist-danger { margin-top: 24px; padding-top: 18px; border-top: 1px solid #ffffff1d; }
@media (max-width: 620px) {
  dialog.fw-mylist-manager[data-mylist-manager] { padding: 8px; }
  .fw-mylist-manager .fw-mylist-card { border-radius: 11px; }
  .fw-mylist-manager .fw-mylist-header { min-height: 64px; padding: 10px 12px 10px 16px; }
  .fw-mylist-manager .fw-mylist-header h2 { font-size: 18px; }
  .fw-mylist-manager [data-layout] { grid-template-columns: minmax(0,1fr); grid-template-rows: auto minmax(0,1fr); }
  .fw-mylist-manager .fw-mylist-sidebar { padding: 8px; border-right: 0; border-bottom: 1px solid #ffffff1d; }
  .fw-mylist-manager .fw-mylist-sidebar-header { padding-bottom: 4px; }
  .fw-mylist-manager [data-lists] {
    display: flex; flex-direction: row; flex-wrap: nowrap; gap: 6px;
    flex: 0 0 auto; overflow-x: auto; overflow-y: hidden;
  }
  .fw-mylist-manager [data-lists] button {
    flex: 0 0 auto; width: auto; max-width: 180px; min-height: 36px;
    padding: 7px 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .fw-mylist-manager [data-lists] button[aria-current=true] { box-shadow: inset 0 -3px #82d8c0; }
  .fw-mylist-manager [data-create-mylist] { min-height: 36px; margin-top: 6px; }
  .fw-mylist-manager [data-detail] { padding: 16px; }
  .fw-mylist-manager .fw-mylist-detail-head { margin-bottom: 16px; }
}
@media (max-height: 480px) {
  dialog.fw-mylist-manager[data-mylist-manager] { padding: 6px; }
  .fw-mylist-manager .fw-mylist-header { min-height: 52px; padding-block: 6px; }
  .fw-mylist-manager [data-detail] { padding: 12px 16px; }
}
`;
