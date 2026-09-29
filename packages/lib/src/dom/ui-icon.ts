const paths = {
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  details: '<path d="M6 3h8l4 4v14H6zM14 3v5h4M12 12v5"/><circle cx="12" cy="10" r=".5"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  previous: '<path d="m11 5-7 7 7 7M4 12h16"/>',
  next: '<path d="m13 5 7 7-7 7M4 12h16"/>',
  play: '<path d="m8 4 12 8-12 8z"/>',
  pause: '<path d="M8 4v16M16 4v16"/>',
  repeat: '<path d="M19 8a8 8 0 1 0 1 8M19 3v5h-5"/>',
  speed: '<path d="M4 19a9 9 0 1 1 16 0M12 14l5-6M7 19h10"/>',
  volume: '<path d="m11 4-6 5H2v6h3l6 5zM15 8a6 6 0 0 1 0 8M18 4a11 11 0 0 1 0 16"/>',
  mute: '<path d="m11 4-6 5H2v6h3l6 5zM16 9l6 6M16 15l6-6"/>',
  fullscreen: '<path d="M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5"/>',
  comment: '<path d="M3 4h18v13H9l-6 4zM7 8h10M7 12h7"/>',
  playlist: '<path d="M3 5h18M3 11h10M3 17h10m3-5 6 5-6 5z"/>',
  related:
    '<rect x="2" y="3" width="8" height="7" rx="1"/><rect x="14" y="14" width="8" height="7" rx="1"/><path d="M14 6h6v5M10 18H4v-5"/>',
  date: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6h5"/>',
  mylists: '<path d="M6 3h12v18l-6-4-6 4z"/>',
  likes: '<path d="M7 10h-4v11h4zm0 10h11l3-10h-7V3h-3l-4 8"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>',
  unlock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 7-2.6M12 14v3"/>',
};

export type UiIcon = keyof typeof paths;

export function uiIcon(name: UiIcon): string {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
}
