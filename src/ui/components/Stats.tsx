/** Hero (system status + events today + 4 stat tiles), histogram card, storage card. */
import type { ReactNode } from 'react';
import { Cctv, Video, Database, Clock, Zap, Gauge, BarChart3, HardDrive } from 'lucide-react';
import { sentinelHumanBytes, sentinelStorageForecast, type SentinelCamera, type SentinelStats } from '../../api';
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

export function Hero({ cameras, stats }: { cameras: SentinelCamera[]; stats: SentinelStats }) {
  const { t } = useSentinelUi();
  const online = cameras.filter((c) => c.online).length;
  const offline = Math.max(0, stats.cameras - online);
  const fc = sentinelStorageForecast(stats);
  const bytes = sentinelHumanBytes(stats.bytes);
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
          <span className={`nvr-pill ${offline > 0 ? 'nvr-pill--danger' : 'nvr-pill--positive'}`}>
            <span className="nvr-pill__dot" aria-hidden="true" />
            {offline > 0 ? t('nvr.hero.offline', { count: offline }) : t('nvr.hero.allOnline')}
          </span>
        )}
      </div>
      <div className="nvr-hero__primary">
        <span className="nvr-hero__primary-label">
          <Zap size={14} strokeWidth={2} />
          {t('nvr.hero.eventsToday')}
        </span>
        <span className="nvr-hero__primary-value nvr-data">{stats.eventsToday}</span>
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

export function HistogramCard({ histogram }: { histogram: number[] }) {
  const { t } = useSentinelUi();
  const buckets = histogram.length === 24 ? histogram : Array.from({ length: 24 }, (_, i) => histogram[i] ?? 0);
  const max = Math.max(1, ...buckets);
  const hour = new Date().getHours();
  return (
    <div className="nvr-card nvr-card--pad">
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
  const { t } = useSentinelUi();
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
    <div className="nvr-card nvr-card--pad">
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
          {t('nvr.storage.recordings')} {humanBytes(stats.bytes)}
        </span>
        <span>
          <i className="nvr-legend__sw nvr-legend__sw--other" />
          {t('nvr.storage.system')} {humanBytes(fc.other)}
        </span>
        <span>
          <i className="nvr-legend__sw nvr-legend__sw--free" />
          {t('nvr.storage.free')} {humanBytes(stats.diskFree)}
        </span>
        <span>
          <i className="nvr-legend__sw nvr-legend__sw--reserve" />
          {t('nvr.storage.reserve')} {humanBytes(fc.reserve)}
        </span>
      </div>
      <ul className="nvr-kv">
        <li>
          <span>{t('nvr.storage.rate')}</span>
          <b className="nvr-data">
            {fc.ratePerDay ? t('nvr.storage.perDay', { value: humanBytes(fc.ratePerDay) }) : '–'}
          </b>
        </li>
        <li>
          <span>{t('nvr.storage.capacity')}</span>
          <b className="nvr-data">
            {humanBytes(fc.capacity)}
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
          <b className="nvr-data">{stats.segments}</b>
        </li>
      </ul>
      <p className={`nvr-note${fc.status === 'unreachable' ? ' nvr-note--warn' : ''}`}>{note}</p>
    </div>
  );
}
