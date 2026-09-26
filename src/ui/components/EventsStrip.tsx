/** Recent-events filmstrip ("EVENTS"): newest first, object crops with class badges, time below. */
import { sentinelEventPlayTs, fmtTime, type SentinelRecentEvent } from '../../api';
import { useSentinelUi } from '../context';
import { EventBadges, eventLabel } from './ClassBadge';

export function EventsStrip({ events }: { events: SentinelRecentEvent[] }) {
  const { client, t, locale, nav } = useSentinelUi();
  if (!events.length) return null;
  return (
    <section className="nvr-section">
      <h2 className="nvr-section__label">{t('nvr.events.title')}</h2>
      <ul className="nvr-strip">
        {events.map((e) => (
          <li key={`${e.camera}-${e.ts}`}>
            <button
              type="button"
              className="nvr-strip__item"
              onClick={() => nav.openCamera(e.camera, sentinelEventPlayTs(e), e.ts)}
              aria-label={`${eventLabel(t, e)} · ${e.cameraName} · ${fmtTime(e.ts, locale)}`}
              title={e.cameraName}
            >
              <span className="nvr-strip__img">
                <img src={client.eventThumbUrl(e.camera, e.ts)} alt="" loading="lazy" />
                <span className="nvr-strip__badges">
                  <EventBadges ev={e} t={t} />
                </span>
              </span>
              <span className="nvr-strip__time nvr-data">{fmtTime(e.ts, locale)}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
