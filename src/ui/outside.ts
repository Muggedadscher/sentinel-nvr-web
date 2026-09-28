/**
 * Leaving a Home-Screen web app on iPhone/iPad. Apple disables Picture-in-Picture there (the video reports
 * NotSupportedError / `webkitSupportsPresentationMode('picture-in-picture') === false`), while Safari itself allows it —
 * so the camera page offers to open the camera in Safari instead.
 */

/** Running as a Home-Screen web app on iPhone/iPad (`navigator.standalone` exists only in iOS/iPadOS WebKit). */
export function isIosHomeScreenApp(nav: object = globalThis.navigator ?? {}): boolean {
  return (nav as { standalone?: unknown }).standalone === true;
}

/** iOS major version from the user agent (`CPU iPhone OS 18_7 like Mac OS X` → 18); `null` when not stated
 *  (iPadOS in desktop mode reports a Mac user agent). */
export function iosMajor(ua: string = globalThis.navigator?.userAgent ?? ''): number | null {
  const m = /\bOS (\d+)[_.]\d+.* like Mac OS X/.exec(ua);
  return m ? Number(m[1]) : null;
}

/**
 * Link target that opens `url` OUTSIDE the Home-Screen app. iOS 17+ understands `x-safari-https://…` and hands the
 * page to Safari itself; a plain link would only open iOS's in-app browser sheet (not Safari). Older iOS ignores
 * the scheme, and outside a Home-Screen app nothing needs escaping — both get the plain URL.
 */
export function outsideAppHref(
  url: string,
  env: { standalone?: unknown; userAgent?: string } = {
    standalone: (globalThis.navigator as { standalone?: unknown } | undefined)?.standalone,
    userAgent: globalThis.navigator?.userAgent,
  },
): string {
  if (!isIosHomeScreenApp(env) || !/^https?:\/\//i.test(url)) return url;
  const major = iosMajor(env.userAgent ?? '');
  if (major !== null && major < 17) return url;
  return 'x-safari-' + url;
}
