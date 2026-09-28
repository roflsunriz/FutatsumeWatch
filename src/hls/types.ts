export interface HlsDebounced<A extends Array<unknown> = Array<unknown>> {
  (...args: A): void;
  cancel(): void;
}

export interface HlsFragmentLoaderStatic {
  new (config: unknown): HlsLoaderBase;
  frag2hash: (fragment: { url: string; level: number; sn: number; failed: number; levelkey?: { reluri?: string } }) => {
    hash: string;
    videoId: string;
  };
  hasCache: (fragment: {
    url: string;
    level: number;
    sn: number;
    failed: number;
    levelkey?: { reluri?: string };
  }) => Promise<unknown>;
  preloadFragment: (
    fragment: { url: string; level: number; sn: number; failed: number; levelkey?: { reluri?: string } },
    url: string
  ) => Promise<boolean | undefined>;
  levels?: ReadonlyArray<HlsLevel>;
}
