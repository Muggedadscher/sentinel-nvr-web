/**
 * Date + time picker CONTENT (Monday-first month grid, no future days, days before
 * the retention floor disabled, optional time). The host wraps it in its own
 * dialog/modal and renders `footer` where it wants the actions.
 */
import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { fmtMonthYear, hhmmInput, weekdayShorts } from '../../api';
import { useSentinelUi } from '../context';

export interface DatePickerPanelProps {
  dayStart: number;
  timeTs: number;
  /** local midnight of the oldest selectable day, or -Infinity */
  oldestAllowed?: number;
  onGo: (dayStart: number, time: string | null) => void;
}

/** Returns the grid element and a footer (today / time / go) as separate nodes. */
export function useDatePicker({ dayStart, timeTs, oldestAllowed = -Infinity, onGo }: DatePickerPanelProps) {
  const { t, locale } = useSentinelUi();
  const base = new Date(dayStart);
  const [view, setView] = useState(new Date(base.getFullYear(), base.getMonth(), 1));
  const [sel, setSel] = useState(new Date(base.getFullYear(), base.getMonth(), base.getDate()));
  const [time, setTime] = useState(hhmmInput(timeTs));
  const y = view.getFullYear(),
    m = view.getMonth();
  const startIdx = (new Date(y, m, 1).getDay() + 6) % 7;
  const dim = new Date(y, m + 1, 0).getDate();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cells = Array.from({ length: 42 }, (_, i) => {
    const dnum = i - startIdx + 1;
    const d = new Date(y, m, dnum);
    return {
      d,
      out: dnum < 1 || dnum > dim,
      off: d.getTime() > today.getTime() || d.getTime() < oldestAllowed,
      isToday: d.getTime() === today.getTime(),
      sel: d.getFullYear() === sel.getFullYear() && d.getMonth() === sel.getMonth() && d.getDate() === sel.getDate(),
    };
  });
  const submit = () => {
    onGo(sel.getTime(), /^(\d{1,2}):(\d{2})$/.test(time) ? time : null);
  };
  const goToday = () => {
    const n = new Date();
    setView(new Date(n.getFullYear(), n.getMonth(), 1));
    setSel(new Date(n.getFullYear(), n.getMonth(), n.getDate()));
  };
  const grid = (
    <>
      <div className="nvr-dt__head">
        <button
          type="button"
          className="nvr-dt__nav"
          onClick={() => setView(new Date(y, m - 1, 1))}
          aria-label={t('nvr.date.prevMonth')}
        >
          <ChevronLeft size={18} />
        </button>
        <span className="nvr-dt__month">{fmtMonthYear(view.getTime(), locale)}</span>
        <button
          type="button"
          className="nvr-dt__nav"
          onClick={() => setView(new Date(y, m + 1, 1))}
          aria-label={t('nvr.date.nextMonth')}
        >
          <ChevronRight size={18} />
        </button>
      </div>
      <div className="nvr-dt__grid">
        {weekdayShorts(locale).map((w) => (
          <span key={w} className="nvr-dt__wd">
            {w}
          </span>
        ))}
        {cells.map((c, i) => (
          <button
            key={i}
            type="button"
            disabled={c.out || c.off}
            onClick={() => setSel(c.d)}
            className={
              'nvr-dt__d nvr-data' +
              (c.out ? ' nvr-dt__d--dim' : '') +
              (c.off ? ' nvr-dt__d--off' : '') +
              (c.isToday && !c.out ? ' nvr-dt__d--today' : '') +
              (c.sel && !c.out ? ' nvr-dt__d--sel' : '')
            }
          >
            {c.d.getDate()}
          </button>
        ))}
      </div>
    </>
  );
  const footer = (
    <div className="nvr-dt__foot">
      <button type="button" className="nvr-btn nvr-btn--ghost" onClick={goToday}>
        {t('nvr.date.today')}
      </button>
      <input
        className="nvr-input nvr-dt__time nvr-data"
        type="time"
        value={time}
        onChange={(e) => setTime(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
        }}
        aria-label={t('nvr.date.time')}
      />
      <button type="button" className="nvr-btn nvr-btn--primary" onClick={submit}>
        {t('nvr.date.go')}
      </button>
    </div>
  );
  return { grid, footer, submit, goToday };
}

/** Convenience: grid + footer stacked (for hosts without a modal footer slot). */
export function DatePickerPanel(props: DatePickerPanelProps) {
  const { grid, footer } = useDatePicker(props);
  return (
    <div className="nvr-dt">
      {grid}
      {footer}
    </div>
  );
}
