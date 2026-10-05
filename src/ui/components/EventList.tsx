/** Event list (camera page "Events" tab): newest first over all loaded days, a day header at every day change. */
import { Fragment } from 'react';
import { Download } from 'lucide-react';
import {
  sentinelDuration,
  sentinelEventHidden,
  sentinelEventSpan,
  fmtDay,
  fmtTimeSec,
  type SentinelEvent,
} from '../../api';
import { useSentinelUi } from '../context';
import { EventBadges, eventLabel } from './ClassBadge';

export function EventList({
  camId,
  events,
  filterOff,
  onPick,
  onClip,
}: {
  camId: string;
  events: SentinelEvent[];
  filterOff: Record<string, boolean>;
  onPick: (ev: SentinelEvent) => void;
  /** "Event as clip" next to each row (only when the plugin can export clips) */
  onClip?: ((ev: SentinelEvent) => void) | undefined;
}) {
  const { client, t, locale } = useSentinelUi();
  const evs = events
    .filter((e) => !sentinelEventHidden(e, filterOff))
    .slice()
    .sort((a, b) => b.timestamp - a.timestamp);
  if (!evs.length) return <p className="nvr-muted nvr-evlist__empty">{t('nvr.events.none')}</p>;
  let lastDay = '';
  return (
    <div className="nvr-evlist">
      {evs.map((ev) => {
        const d = new Date(ev.timestamp).toDateString();
        const head = d !== lastDay;
        lastDay = d;
        return (
          <Fragment key={ev.id}>
            {head && <div className="nvr-evlist__day nvr-data">{fmtDay(ev.timestamp, locale)}</div>}
            <div className={'nvr-evrow-wrap' + (onClip ? ' nvr-evrow-wrap--clip' : '')}>
              <button type="button" className="nvr-evrow" onClick={() => onPick(ev)}>
                <img className="nvr-evrow__img" src={client.eventThumbUrl(camId, ev.timestamp)} alt="" loading="lazy" />
                <span className="nvr-evrow__text">
                  <span className="nvr-evrow__cls">
                    <EventBadges ev={ev} size={16} t={t} /> {eventLabel(t, ev)}
                  </span>
                  <span className="nvr-evrow__t nvr-data">
                    {fmtTimeSec(ev.timestamp, locale)}
                    <EventSpanNote ev={ev} t={t} />
                  </span>
                </span>
              </button>
              {onClip && (
                <button
                  type="button"
                  className="nvr-iconbtn nvr-evrow__clip"
                  aria-label={`${t('nvr.clip.event')} ${fmtTimeSec(ev.timestamp, locale)}`}
                  title={t('nvr.clip.event')}
                  onClick={() => onClip(ev)}
                >
                  <Download size={16} />
                </button>
              )}
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}

/** "· 0:42" after the time of an event that lasted, "· läuft" while it runs (plugin ≥ 1.3.0). */
function EventSpanNote({ ev, t }: { ev: SentinelEvent; t: (k: string) => string }) {
  const sp = sentinelEventSpan(ev);
  if (!sp) return null;
  return sp.open ? (
    <span className="nvr-evrow__open"> · {t('nvr.events.running')}</span>
  ) : (
    <> · {sentinelDuration(sp.end - sp.start)}</>
  );
}
