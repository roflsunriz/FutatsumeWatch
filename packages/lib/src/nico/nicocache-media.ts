/** NicoCache_nlがHLS内へ出すローカル映像URL。管理画面・任意の.testホストは対象にしない。 */
export function isNicoCacheMediaUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      url.hostname === 'nicocachenl.test' &&
      !url.username &&
      !url.password &&
      !url.port &&
      /^\/media\/v1\/playback-sessions\/[a-z0-9_-]+\/files\/(?:audio|video)\/[a-z0-9_-]+(?:\.[a-z0-9_-]+)+$/i.test(
        url.pathname
      )
    );
  } catch {
    return false;
  }
}
