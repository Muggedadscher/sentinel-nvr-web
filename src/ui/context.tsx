/**
 * Host contract for the shared UI: the API client, a translate function and the
 * locale (Intl), plus navigation callbacks — the components never touch a router.
 */
import { createContext, useContext, type ReactNode } from 'react';
import type { SentinelClient } from '../api';
import type { TFn } from './i18n';

export interface SentinelUiNav {
  /** open a camera's timeline; `atMs` = playback start, `eventTs` = the event to poster (both from the events strip) */
  openCamera: (camId: string, atMs?: number, eventTs?: number) => void;
}
export interface SentinelUiValue {
  client: SentinelClient;
  t: TFn;
  /** BCP-47 tag for Intl formatting, e.g. 'de-DE' */
  locale: string;
  nav: SentinelUiNav;
}

const Ctx = createContext<SentinelUiValue | null>(null);

export function SentinelUiProvider({ value, children }: { value: SentinelUiValue; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSentinelUi(): SentinelUiValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('SentinelUiProvider missing');
  return v;
}
