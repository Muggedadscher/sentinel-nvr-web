import { describe, expect, it } from 'vitest';
import { iosMajor, isIosHomeScreenApp, outsideAppHref } from '../../src/ui/outside';

const IPHONE_18 =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
const IPHONE_16 =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
const IPAD_DESKTOP =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const URL = 'https://nvr.example/endpoint/@local/sentinel-nvr/public/#/timeline/33';

describe('leaving an iPhone/iPad Home-Screen app', () => {
  it('detects the Home-Screen app only by navigator.standalone === true', () => {
    expect(isIosHomeScreenApp({ standalone: true })).toBe(true);
    expect(isIosHomeScreenApp({ standalone: false })).toBe(false);
    expect(isIosHomeScreenApp({})).toBe(false);
  });
  it('reads the iOS major version from the user agent', () => {
    expect(iosMajor(IPHONE_18)).toBe(18);
    expect(iosMajor(IPHONE_16)).toBe(16);
    expect(iosMajor(IPAD_DESKTOP)).toBeNull();
  });
  it('iOS 17+ Home-Screen app: x-safari-https (Safari itself, not the in-app browser sheet)', () => {
    expect(outsideAppHref(URL, { standalone: true, userAgent: IPHONE_18 })).toBe('x-safari-' + URL);
    expect(outsideAppHref(URL, { standalone: true, userAgent: IPAD_DESKTOP })).toBe('x-safari-' + URL);
  });
  it('plain URL on older iOS, outside a Home-Screen app and for non-http links', () => {
    expect(outsideAppHref(URL, { standalone: true, userAgent: IPHONE_16 })).toBe(URL);
    expect(outsideAppHref(URL, { standalone: false, userAgent: IPHONE_18 })).toBe(URL);
    expect(outsideAppHref('/relative', { standalone: true, userAgent: IPHONE_18 })).toBe('/relative');
  });
});
