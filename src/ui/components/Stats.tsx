/** Hero (system status + events today + 4 stat tiles), histogram card, storage card. */
import type { CSSProperties, ReactNode } from 'react';
import { Fragment } from 'react';
import { Cctv, Video, Database, Clock, Zap, Gauge, BarChart3, HardDrive, CalendarClock, CircleDot } from 'lucide-react';
import {
  fmtCount,
  sentinelHumanBytes,
  sentinelRecordingState,
  sentinelStorageForecast,
  type SentinelCamera,
  type SentinelStats,
} from '../../api';
import { useSentinelUi } from '../context';
import { fmtDays, humanBytes } from '../format';

export type Tone = 'accent' | 'info' | 'positive' | 'danger' | 'neutral';

export function StatTile({
  icon,
  label,
  value,
  unit,
  tone = 'neutral',
}: {
  icon: ReactNode;
  label: string;
  value: string;
  unit?: string | undefined;
  tone?: Tone;
}) {
  return (
    <div className={`nvr-stat nvr-stat--${tone}`}>
      <span className="nvr-stat__icon" aria-hidden="true">
        {icon}
      </span>
      <div className="nvr-stat__body">
        <span className="nvr-stat__label">{label}</span>
        <span className="nvr-stat__value nvr-data">
          {value}
          {unit && <span className="nvr-stat__unit"> {unit}</span>}
        </span>
      </div>
    </div>
  );
}

export function CardTitle({
  icon,
  title,
  sub,
  tone = 'accent',
  action,
}: {
  icon: ReactNode;
  title: string;
  sub?: string | undefined;
  tone?: Tone;
  action?: ReactNode;
}) {
  return (
    <div className="nvr-ctitle">
      <span className={`nvr-ctitle__chip nvr-ctitle__chip--${tone}`} aria-hidden="true">
        {icon}
      </span>
      <div className="nvr-ctitle__text">
        <div className="nvr-ctitle__title">{title}</div>
        {sub && <div className="nvr-ctitle__sub">{sub}</div>}
      </div>
      {action && <div className="nvr-ctitle__action">{action}</div>}
    </div>
  );
}

/** `appearance="glass"`: the head of the style "Glas", a tafel as on HAPulse's other pages (from 0.21.0, before HAPulse's
 *  `NvrHeroGlas`): the camera symbol in a circle, the state large in its colour, the values as a grid. Same facts as the
 *  classic hero; looks in `glas.css` (`.nvr-tafel*`). Without the prop the markup is that of 0.20. */
export function Hero({
  cameras,
  stats,
  appearance,
}: {
  cameras: SentinelCamera[];
  stats: SentinelStats;
  appearance?: 'glass';
}) {
  if (appearance === 'glass') return <GlassHero cameras={cameras} stats={stats} />;
  return <ClassicHero cameras={cameras} stats={stats} />;
}

function ClassicHero({ cameras, stats }: { cameras: SentinelCamera[]; stats: SentinelStats }) {
  const { t, locale } = useSentinelUi();
  // a camera whose recording hangs counts as online (its ffmpeg runs or is just restarting) and has its own count
  const stalled = cameras.filter((c) => sentinelRecordingState(c) === 'stalled').length;
  const online = cameras.filter((c) => c.online || sentinelRecordingState(c) === 'stalled').length;
  const offline = Math.max(0, stats.cameras - online);
  const problems = [
    offline > 0 ? t('nvr.hero.offline', { count: offline }) : null,
    stalled > 0 ? t('nvr.hero.stalled', { count: stalled }) : null,
  ].filter(Boolean);
  const fc = sentinelStorageForecast(stats);
  const bytes = sentinelHumanBytes(stats.bytes, locale);
  const span = fc.spanDays ? fmtDays(fc.spanDays, t).split(' ') : ['–'];
  return (
    <div className="nvr-card nvr-hero">
      <div className="nvr-hero__head">
        <CardTitle icon={<Gauge size={16} strokeWidth={1.75} />} title={t('nvr.hero.title')} sub={t('nvr.hero.sub')} />
        {stats.storageOk === false ? (
          // storage guard: the share is gone — nothing is recorded until it is back (outranks the camera status)
          <span className="nvr-pill nvr-pill--danger" title={stats.storageProblem}>
            <span className="nvr-pill__dot" aria-hidden="true" />
            {t('nvr.hero.storageProblem')}
          </span>
        ) : (
          <span className={`nvr-pill ${problems.length ? 'nvr-pill--danger' : 'nvr-pill--positive'}`}>
            <span className="nvr-pill__dot" aria-hidden="true" />
            {problems.length ? problems.join(' · ') : t('nvr.hero.allOnline')}
          </span>
        )}
      </div>
      <div className="nvr-hero__primary">
        <span className="nvr-hero__primary-label">
          <Zap size={14} strokeWidth={2} />
          {t('nvr.hero.eventsToday')}
        </span>
        <span className="nvr-hero__primary-value nvr-data">{fmtCount(stats.eventsToday, locale)}</span>
      </div>
      <div className="nvr-hero__stats">
        <StatTile
          icon={<Cctv size={16} strokeWidth={1.75} />}
          label={t('nvr.hero.camerasOnline')}
          value={`${online}`}
          unit={`/ ${stats.cameras}`}
          tone={offline > 0 ? 'danger' : 'positive'}
        />
        <StatTile
          icon={<Video size={16} strokeWidth={1.75} />}
          label={t('nvr.hero.recording')}
          value={`${stats.recording}`}
          unit={`/ ${stats.cameras}`}
          tone="accent"
        />
        <StatTile
          icon={<Database size={16} strokeWidth={1.75} />}
          label={t('nvr.hero.storageUsed')}
          value={bytes.value}
          unit={bytes.unit}
          tone="info"
        />
        <StatTile
          icon={<Clock size={16} strokeWidth={1.75} />}
          label={t('nvr.hero.retention')}
          value={span[0] ?? '–'}
          unit={span.slice(1).join(' ') || undefined}
        />
      </div>
    </div>
  );
}

const TAFEL_ICON = 15;

/** "14 Tage" → value "14", unit "Tage", as the classic hero splits it; anything else stays whole */
function splitCount(text: string): { value: string; unit?: string } {
  const m = /^(\d+)\s+(.+)$/.exec(text);
  return m ? { value: m[1]!, unit: m[2]! } : { value: text };
}

type TafelTone = 'none' | 'ok' | 'warn' | 'danger';

function GlassHero({ cameras, stats }: { cameras: SentinelCamera[]; stats: SentinelStats }) {
  const { t, locale } = useSentinelUi();
  const stalled = cameras.filter((c) => sentinelRecordingState(c) === 'stalled').length;
  const online = cameras.filter((c) => c.online || sentinelRecordingState(c) === 'stalled').length;
  const offline = Math.max(0, stats.cameras - online);
  const problems = [
    offline > 0 ? t('nvr.hero.offline', { count: offline }) : null,
    stalled > 0 ? t('nvr.hero.stalled', { count: stalled }) : null,
  ].filter((p): p is string => p !== null);
  const storageLost = stats.storageOk === false;
  const ok = !storageLost && problems.length === 0;
  // a line breaks between the problems, not inside one ("1 Kamera offline · 1 Aufnahme hängt")
  const parts = storageLost ? [t('nvr.hero.storageProblem')] : ok ? [t('nvr.hero.allOnline')] : problems;
  const fc = sentinelStorageForecast(stats);
  const bytes = sentinelHumanBytes(stats.bytes, locale);
  const retention = fc.spanDays ? splitCount(fmtDays(fc.spanDays, t)) : { value: '–' };
  const tone: TafelTone = ok ? 'ok' : 'danger';
  const items: { key: string; icon: ReactNode; label: string; value: string; unit?: string; tone: TafelTone }[] = [
    {
      key: 'events',
      icon: <Zap size={TAFEL_ICON} strokeWidth={2} />,
      label: t('nvr.hero.eventsToday'),
      value: fmtCount(stats.eventsToday, locale),
      tone: 'none',
    },
    {
      key: 'recording',
      icon: <CircleDot size={TAFEL_ICON} strokeWidth={2} />,
      label: t('nvr.hero.recording'),
      value: `${fmtCount(stats.recording, locale)}/${fmtCount(stats.cameras, locale)}`,
      tone: 'none',
    },
    {
      key: 'storage',
      icon: <HardDrive size={TAFEL_ICON} strokeWidth={2} />,
      label: t('nvr.hero.storageUsed'),
      value: bytes.value,
      unit: bytes.unit,
      tone: 'none',
    },
    {
      key: 'retention',
      icon: <CalendarClock size={TAFEL_ICON} strokeWidth={2} />,
      label: t('nvr.hero.retention'),
      value: retention.value,
      ...(retention.unit ? { unit: retention.unit } : {}),
      // the retention target out of reach: the storage card says why
      tone: fc.status === 'unreachable' ? 'warn' : 'none',
    },
  ];
  return (
    <div className={`nvr-card nvr-tafel nvr-tafel--${ok ? 'ok' : 'problem'}`}>
      <div className="nvr-tafel__head">
        <span className="nvr-tafel__badge" data-tone={tone} aria-hidden="true">
          <Cctv size={28} strokeWidth={1.75} />
        </span>
        <div className="nvr-tafel__head-text">
          <p className="nvr-tafel__kicker">{t('nvr.hero.title')}</p>
          <p className="nvr-tafel__title" data-tone={tone} title={storageLost ? stats.storageProblem : undefined}>
            {parts.map((part, i) => (
              <Fragment key={i}>
                {i > 0 && ' · '}
                <span className="nvr-tafel__part">{part}</span>
              </Fragment>
            ))}
          </p>
        </div>
      </div>
      <dl
        className="nvr-tafel__grid"
        data-kind="number"
        data-min={130}
        style={{ '--nvr-tafel-min': '130px', '--nvr-tafel-max': 4 } as CSSProperties}
      >
        {items.map((f) => (
          <div key={f.key} className="nvr-tafel__cell" data-tone={f.tone} data-tafel={f.key}>
            <dt className="nvr-tafel__label">
              {f.icon}
              <span className="nvr-tafel__label-text">{f.label}</span>
            </dt>
            <dd className="nvr-tafel__value">
              {f.value}
              {f.unit && <span className="nvr-tafel__unit">{` ${f.unit}`}</span>}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function HistogramCard({ histogram }: { histogram: number[] }) {
  const { t } = useSentinelUi();
  const buckets = histogram.length === 24 ? histogram : Array.from({ length: 24 }, (_, i) => histogram[i] ?? 0);
  const max = Math.max(1, ...buckets);
  const hour = new Date().getHours();
  return (
    <div className="nvr-card nvr-card--pad nvr-statcard">
      <CardTitle
        icon={<BarChart3 size={16} strokeWidth={1.75} />}
        title={t('nvr.histogram.title')}
        sub={t('nvr.histogram.sub')}
      />
      <div className="nvr-chart" role="img" aria-label={t('nvr.histogram.title')}>
        {buckets.map((v, i) => (
          <div
            key={i}
            className={`nvr-chart__col${i === hour ? ' nvr-chart__col--now' : ''}`}
            title={`${String(i).padStart(2, '0')}:00 – ${v}`}
          >
            <div className="nvr-chart__bar" style={{ height: `${(v / max) * 100}%` }} />
          </div>
        ))}
      </div>
      <div className="nvr-chart__axis nvr-data">
        <span>00</span>
        <span>06</span>
        <span>12</span>
        <span>18</span>
        <span>24</span>
      </div>
    </div>
  );
}

export function StorageCard({ stats }: { stats: SentinelStats }) {
  const { t, locale } = useSentinelUi();
  const fc = sentinelStorageForecast(stats);
  const pct = (v: number) => (stats.diskTotal ? `${((v / stats.diskTotal) * 100).toFixed(2)}%` : '0%');
  const reserveShown = Math.min(fc.reserve, stats.diskFree);
  let note: string;
  switch (fc.status) {
    case 'unreachable':
      note =
        t('nvr.storage.note.unreachable', { target: stats.retentionDays, fits: fmtDays(fc.fitsDays, t) }) +
        (fc.steady ? '' : ' ' + t('nvr.storage.note.fullIn', { days: fmtDays(fc.fillsInDays, t) }));
      break;
    case 'reachable':
      note = t(
        fc.spanDays >= stats.retentionDays ? 'nvr.storage.note.reachableAge' : 'nvr.storage.note.reachableEvict',
        { fits: fmtDays(fc.fitsDays, t) },
      );
      break;
    case 'filling':
      note = t('nvr.storage.note.filling', { fillsIn: fmtDays(fc.fillsInDays, t), fits: fmtDays(fc.fitsDays, t) });
      break;
    default:
      note = t('nvr.storage.note.unknown');
  }
  return (
    <div className="nvr-card nvr-card--pad nvr-statcard">
      <CardTitle
        icon={<HardDrive size={16} strokeWidth={1.75} />}
        title={t('nvr.storage.title')}
        sub={t('nvr.storage.sub')}
        tone="info"
      />
      <div className="nvr-meter" role="img" aria-label={t('nvr.storage.title')}>
        <span className="nvr-meter__rec" style={{ width: pct(stats.bytes) }} />
        <span className="nvr-meter__other" style={{ left: pct(stats.bytes), width: pct(fc.other) }} />
        <span className="nvr-meter__reserve" style={{ width: pct(reserveShown) }} />
      </div>
      <div className="nvr-legend">
        <span>
          <i className="nvr-legend__sw nvr-legend__sw--rec" />
          {t('nvr.storage.recordings')} {humanBytes(stats.bytes, locale)}
        </span>
        <span>
          <i className="nvr-legend__sw nvr-legend__sw--other" />
          {t('nvr.storage.system')} {humanBytes(fc.other, locale)}
        </span>
        <span>
          <i className="nvr-legend__sw nvr-legend__sw--free" />
          {t('nvr.storage.free')} {humanBytes(stats.diskFree, locale)}
        </span>
        <span>
          <i className="nvr-legend__sw nvr-legend__sw--reserve" />
          {t('nvr.storage.reserve')} {humanBytes(fc.reserve, locale)}
        </span>
      </div>
      <ul className="nvr-kv">
        <li>
          <span>{t('nvr.storage.rate')}</span>
          <b className="nvr-data">
            {fc.ratePerDay ? t('nvr.storage.perDay', { value: humanBytes(fc.ratePerDay, locale) }) : '–'}
          </b>
        </li>
        <li>
          <span>{t('nvr.storage.capacity')}</span>
          <b className="nvr-data">
            {humanBytes(fc.capacity, locale)}
            {fc.ratePerDay ? <em> ≈ {fmtDays(fc.fitsDays, t)}</em> : null}
          </b>
        </li>
        <li>
          <span>{t('nvr.storage.retention')}</span>
          <b className="nvr-data">
            {fc.spanDays ? `~${fmtDays(fc.spanDays, t)}` : '–'}
            <em> / {t('nvr.storage.target', { days: stats.retentionDays })}</em>
          </b>
        </li>
        <li>
          <span>{t('nvr.storage.segments')}</span>
          <b className="nvr-data">{fmtCount(stats.segments, locale)}</b>
        </li>
      </ul>
      <p className={`nvr-note${fc.status === 'unreachable' ? ' nvr-note--warn' : ''}`}>{note}</p>
    </div>
  );
}
