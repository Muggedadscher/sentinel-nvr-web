/** Camera tiles ("CAMERAS"): fresh snapshot every 5 s → newest segment thumbnail → placeholder; name + recording dot, offline / recording-stalled badge, meta.
 *  A tile carries its camera's id (`data-nvr-camera`) and holds its picture in one box (`.nvr-camtile__pic`): a tile that
 *  mounts again shows the camera's last picture there at once, until its own snapshot is on screen — back on the
 *  overview there are pictures, not empty tiles, and a host's transition back from the camera page lands in one. */
import { useCallback, useEffect, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Camera, VideoOff, WifiOff } from 'lucide-react';
import { sentinelRecordingState, type SentinelCamera } from '../../api';
import { useSentinelUi } from '../context';
import { fmtRelative } from '../format';
import { drawLastTileSnapshot, hasLastTileSnapshot, rememberTileSnapshot } from '../snapshot-cache';

const SNAPSHOT_MS = 5000;
/** Tile snapshot width: a tile is ~300–450 CSS px wide; the 5-MP original (~400 KB every 5 s per camera) only cost the
 *  phone bandwidth and decode time. 640 px ≈ 66 KB, 960 px ≈ 150 KB (Amcrest, measured 27.09.2026). The same picture is
 *  the poster when the camera opens. */
export function tileSnapshotWidth(): number {
  return (window.devicePixelRatio || 1) >= 2 ? 960 : 640;
}
const RETRY_EVERY = 6; // ticks (30 s): give a failed snapshot another chance instead of degrading until remount

function CameraTile({ cam, tick, n }: { cam: SentinelCamera; tick: number; n: number }) {
  const { client, t, nav } = useSentinelUi();
  const [failed, setFailed] = useState(0); // 0 snapshot · 1 thumbnail · 2 placeholder
  // the camera's last picture (from any tile, before the page change) under this tile's own until that is decoded
  const [last, setLast] = useState(() => hasLastTileSnapshot(cam.id));
  const drawLast = useCallback(
    (canvas: HTMLCanvasElement | null) => void (canvas && drawLastTileSnapshot(cam.id, canvas)),
    [cam.id],
  );
  useEffect(() => {
    setFailed(0);
  }, [client, cam.id]);
  useEffect(() => {
    if (n % RETRY_EVERY === 0) setFailed(0);
  }, [n]);
  const src =
    failed === 0
      ? client.snapshotUrl(cam.id, tick, tileSnapshotWidth())
      : failed === 1 && cam.latestThumbId
        ? client.segmentThumbUrl(cam.latestThumbId)
        : null;
  const open = () => nav.openCamera(cam.id);
  const rec = sentinelRecordingState(cam);
  const meta = [
    t('nvr.cameras.eventsToday', { count: cam.eventsToday }),
    cam.lastEventTs ? fmtRelative(cam.lastEventTs, t) : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <div
      className={`nvr-card nvr-camtile${rec === 'offline' || rec === 'stalled' ? ' nvr-camtile--badged' : ''}`}
      data-nvr-camera={cam.id}
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open();
        }
      }}
      aria-label={cam.name}
    >
      {src ? (
        <span className="nvr-camtile__pic">
          {last && <canvas className="nvr-camtile__img" ref={drawLast} aria-hidden="true" />}
          <img
            className="nvr-camtile__img"
            src={src}
            alt=""
            crossOrigin="anonymous"
            onLoad={(e) => {
              const img = e.currentTarget;
              rememberTileSnapshot(cam.id, img);
              if (!last) return;
              // the last picture goes once this one is decoded (it lies on top, nothing in between shows)
              const drop = () => setLast(false);
              if (typeof img.decode === 'function') img.decode().then(drop, drop);
              else drop();
            }}
            onError={() => setFailed((f) => Math.min(2, f + 1))}
          />
        </span>
      ) : (
        <div className="nvr-camtile__placeholder" aria-hidden="true">
          <Camera size={32} strokeWidth={1.5} />
        </div>
      )}
      <span className="nvr-camtile__name">
        {cam.name}
        {cam.recording && (
          <i className={`nvr-camtile__dot${rec === 'ok' ? '' : ' nvr-camtile__dot--off'}`} aria-hidden="true" />
        )}
      </span>
      {rec === 'offline' && (
        <span className="nvr-camtile__offline">
          <WifiOff size={12} strokeWidth={2.25} />
          {t('nvr.cameras.offline')}
        </span>
      )}
      {rec === 'stalled' && (
        // ffmpeg runs (or restarts) but writes nothing — the server's watchdog restarts it
        <span className="nvr-camtile__offline" title={t('nvr.cameras.stalledHint')}>
          <VideoOff size={12} strokeWidth={2.25} />
          {t('nvr.cameras.stalled')}
        </span>
      )}
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
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') {
        setTick(Date.now());
        setN((x) => x + 1);
      }
    }, SNAPSHOT_MS);
    return () => clearInterval(id);
  }, []);
  if (cameras.length === 0) return <p className="nvr-muted">{t('nvr.cameras.none')}</p>;
  return (
    <div className="nvr-camgrid">
      {cameras.map((c) => (
        <CameraTile key={c.id} cam={c} tick={tick} n={n} />
      ))}
    </div>
  );
}

/** `icon`: a symbol in front of the title (a host's look; without it the markup is that of 0.18.0). */
export function CameraGrid({ cameras, icon }: { cameras: SentinelCamera[]; icon?: ReactNode }) {
  const { t } = useSentinelUi();
  return (
    <section className="nvr-section">
      <h2 className="nvr-section__label">
        {icon && (
          <span className="nvr-section__icon" aria-hidden="true">
            {icon}
          </span>
        )}
        {t('nvr.cameras.title')}
      </h2>
      <CameraTiles cameras={cameras} />
    </section>
  );
}
