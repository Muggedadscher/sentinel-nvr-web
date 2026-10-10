/** Recent-events filmstrip ("EVENTS"): newest first, object crops with class badges, time below — with "yesterday"
 *  (or a short date) in front for events before the viewer's midnight, the strip reaches 24 h back. */
import type { ReactNode } from 'react';
import { sentinelEventPlayTs, fmtDayPrefix, fmtTime, type SentinelRecentEvent } from '../../api';
import { useSentinelUi } from '../context';
import { EventBadges, eventLabel } from './ClassBadge';

/** `icon`: a symbol in front of the title (a host's look; without it the markup is that of 0.18.0). */
export function EventsStrip({ events, icon }: { events: SentinelRecentEvent[]; icon?: ReactNode }) {
  const { client, t, locale, nav } = useSentinelUi();
  if (!events.length) return null;
  const now = Date.now();
  return (
    <section className="nvr-section">
      <h2 className="nvr-section__label">
        {icon && (
          <span className="nvr-section__icon" aria-hidden="true">
            {icon}
          </span>
        )}
        {t('nvr.events.title')}
      </h2>
      <ul className="nvr-strip">
        {events.map((e) => {
          const day = fmtDayPrefix(e.ts, locale, now);
          const time = fmtTime(e.ts, locale);
          return (
            <li key={`${e.camera}-${e.ts}`}>
              <button
                type="button"
                className="nvr-strip__item"
                onClick={() => nav.openCamera(e.camera, sentinelEventPlayTs(e), e.ts)}
                aria-label={`${eventLabel(t, e)} · ${e.cameraName} · ${day ? `${day} ${time}` : time}`}
                title={e.cameraName}
              >
                <span className="nvr-strip__img">
                  <img src={client.eventThumbUrl(e.camera, e.ts)} alt="" loading="lazy" />
                  <span className="nvr-strip__badges">
                    <EventBadges ev={e} t={t} />
                  </span>
                </span>
                {/* Day and clock never break inside; between them only where both don't fit (English, 107/96 px). */}
                <span className="nvr-strip__time nvr-data">
                  {day && (
                    <>
                      <span className="nvr-strip__day">{day}</span>{' '}
                    </>
                  )}
                  <span className="nvr-strip__clock">{time}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
