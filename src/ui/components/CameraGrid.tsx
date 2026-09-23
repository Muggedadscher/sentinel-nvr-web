/** Camera tiles ("CAMERAS"): fresh snapshot every 5 s → newest segment thumbnail → placeholder; name + recording dot, offline badge, meta. */
import { useEffect, useState, type KeyboardEvent } from 'react';
import { Camera, WifiOff } from 'lucide-react';
import type { SentinelCamera } from '../../api';
import { useSentinelUi } from '../context';
import { fmtRelative } from '../format';
import { rememberTileSnapshot } from '../snapshot-cache';

const SNAPSHOT_MS = 5000;
const RETRY_EVERY = 6; // ticks (30 s): give a failed snapshot another chance instead of degrading until remount

function CameraTile({ cam, tick, n }: { cam: SentinelCamera; tick: number; n: number }) {
  const { client, t, nav } = useSentinelUi();
  const [failed, setFailed] = useState(0); // 0 snapshot · 1 thumbnail · 2 placeholder
  useEffect(() => { setFailed(0); }, [client, cam.id]);
  useEffect(() => { if (n % RETRY_EVERY === 0) setFailed(0); }, [n]);
  const src = failed === 0 ? client.snapshotUrl(cam.id, tick) : failed === 1 && cam.latestThumbId ? client.segmentThumbUrl(cam.latestThumbId) : null;
  const open = () => nav.openCamera(cam.id);
  const meta = [t('nvr.cameras.eventsToday', { count: cam.eventsToday }), cam.lastEventTs ? fmtRelative(cam.lastEventTs, t) : null].filter(Boolean).join(' · ');
  return (
    <div className="nvr-card nvr-camtile" role="button" tabIndex={0} onClick={open}
      onKeyDown={(e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } }} aria-label={cam.name}>
      {src ? <img className="nvr-camtile__img" src={src} alt="" onLoad={() => rememberTileSnapshot(cam.id, src)} onError={() => setFailed((f) => Math.min(2, f + 1))} />
           : <div className="nvr-camtile__placeholder" aria-hidden="true"><Camera size={32} strokeWidth={1.5} /></div>}
      <span className="nvr-camtile__name">{cam.name}{cam.recording && <i className={`nvr-camtile__dot${cam.online ? '' : ' nvr-camtile__dot--off'}`} aria-hidden="true" />}</span>
      {cam.recording && !cam.online && <span className="nvr-camtile__offline"><WifiOff size={12} strokeWidth={2.25} />{t('nvr.cameras.offline')}</span>}
      <span className="nvr-camtile__meta nvr-data">{meta}</span>
    </div>
  );
}

/** The tile grid alone (e.g. for a host's security page). */
export function CameraTiles({ cameras }: { cameras: SentinelCamera[] }) {
  const { t } = useSentinelUi();
  const [tick, setTick] = useState(() => Date.now());
  const [n, setN] = useState(0);
  useEffect(() => {
    const id = setInterval(() => { if (document.visibilityState === 'visible') { setTick(Date.now()); setN((x) => x + 1); } }, SNAPSHOT_MS);
    return () => clearInterval(id);
  }, []);
  if (cameras.length === 0) return <p className="nvr-muted">{t('nvr.cameras.none')}</p>;
  return <div className="nvr-camgrid">{cameras.map((c) => <CameraTile key={c.id} cam={c} tick={tick} n={n} />)}</div>;
}

export function CameraGrid({ cameras }: { cameras: SentinelCamera[] }) {
  const { t } = useSentinelUi();
  return (
    <section className="nvr-section">
      <h2 className="nvr-section__label">{t('nvr.cameras.title')}</h2>
      <CameraTiles cameras={cameras} />
    </section>
  );
}
