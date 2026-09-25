// 大百科アイコンの描画を TagListView と MylistPocket の動画詳細表示で共通化する。
// 存在判定自体は getNicodicArticleExists（api.dic.nicovideo.jp 照会）が正本。
// 未取得は unknown、2xx だけがあり、404 だけがなし、それ以外は不明として扱う。
export function createDicIconHtml(text: string, hasDic?: boolean): string {
  const href = `https://dic.nicovideo.jp/a/${encodeURIComponent(text)}`;
  const src = hasDic
    ? 'https://live.nicovideo.jp/img/2012/watch/tag_icon002.png'
    : 'https://live.nicovideo.jp/img/2012/watch/tag_icon003.png';
  const icon = `<img class="dicIcon" src="${src}">`;

  const hasNicodic = hasDic === undefined ? 'unknown' : hasDic ? '1' : '0';
  const title = hasDic === undefined ? '大百科の有無は未取得' : hasDic ? '大百科あり' : '大百科なし';
  return `<futatsume-tag-item-menu
        class="tagItemMenu"
        data-text="${encodeURIComponent(text)}"
        data-has-nicodic="${hasNicodic}"
        title="${title}"
      ><a target="_blank" class="nicodic" href="${href}">${icon}</a></futatsume-tag-item-menu>`;
}
