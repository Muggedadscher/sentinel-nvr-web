/**
 * "Appearance" settings section (port of HAPulse's AppearanceSection, MIT,
 * © 2026 Julian — see NOTICE.md): light/dark/auto segmented control, language
 * select, theme preview cards, accent-hue rainbow slider. Controlled component —
 * the host owns the persisted choice (HAPulse: settingsStore; Sentinel: localStorage).
 */
import { useState, type ReactNode } from 'react';
import { ChevronDown, Languages, Palette, Sun } from 'lucide-react';
import { useSentinelUi } from '../context';
import {
  THEMES,
  THEME_LABELS,
  THEME_NAMES,
  resolveMode,
  type ResolvedMode,
  type ThemeMode,
  type ThemeName,
} from '../theme';

export interface AppearanceProps {
  theme: ThemeName;
  mode: ThemeMode;
  accentHue?: number | undefined;
  /** current language choice: a locale code or 'auto' (browser language) */
  language: string;
  /** selectable languages (native names); 'auto' is added by the component */
  languages: readonly { id: string; label: string }[];
  onTheme: (name: ThemeName) => void;
  onMode: (mode: ThemeMode) => void;
  onAccent: (hue: number | undefined) => void;
  onLanguage: (id: string) => void;
}

/** Hue (0–360) of a `#rrggbb` colour — the slider's rest position for a theme's own accent. */
export function hexHue(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255,
    g = parseInt(hex.slice(3, 5), 16) / 255,
    b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return Math.round(h * 360);
}

/** Mini preview card for one theme identity (bg, card, accent stripe, two text lines). */
export function ThemeSwatch({
  name,
  active,
  previewMode,
  onClick,
  ariaLabel,
}: {
  name: ThemeName;
  active: boolean;
  previewMode: ResolvedMode;
  onClick: () => void;
  ariaLabel: string;
}) {
  const c = THEMES[name][previewMode];
  return (
    <button
      type="button"
      className={'nvr-swatch' + (active ? ' nvr-swatch--active' : '')}
      onClick={onClick}
      aria-label={ariaLabel}
      aria-pressed={active}
    >
      <div className="nvr-swatch__preview" style={{ background: c.bg }} aria-hidden="true">
        <div
          style={{
            position: 'absolute',
            top: 10,
            left: 10,
            right: 10,
            bottom: 10,
            background: c.bgCard,
            borderRadius: 8,
            border: `1px solid ${c.line}`,
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: 16,
            left: 16,
            width: 28,
            height: 6,
            background: c.accent,
            borderRadius: 3,
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: 28,
            left: 16,
            right: 16,
            height: 4,
            background: c.text,
            borderRadius: 2,
            opacity: 0.5,
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: 38,
            left: 16,
            right: 28,
            height: 3,
            background: c.textDim,
            borderRadius: 2,
            opacity: 0.4,
          }}
        />
      </div>
      <span className="nvr-swatch__name">{THEME_LABELS[name]}</span>
    </button>
  );
}

export function AppearanceSection(p: AppearanceProps) {
  const { t } = useSentinelUi();
  const resolved = resolveMode(p.mode);
  const defaultHue = (name: ThemeName) => hexHue(THEMES[name][resolved].accent);
  const [localHue, setLocalHue] = useState<number>(p.accentHue ?? defaultHue(p.theme));
  const previewColor =
    p.accentHue !== undefined
      ? `hsl(${p.accentHue}, 78%, ${resolved === 'dark' ? 60 : 50}%)`
      : THEMES[p.theme][resolved].accent;
  const modes: ThemeMode[] = ['light', 'dark', 'auto'];
  const chip = (bg: string, fg: string, icon: ReactNode) => (
    <span className="nvr-set__chip" style={{ background: bg, color: fg }}>
      {icon}
    </span>
  );
  return (
    <section className="nvr-set__section">
      <div className="nvr-section__label">{t('nvr.settings.appearance')}</div>
      <div className="nvr-card nvr-set-card">
        <div className="nvr-set__row nvr-set__row--inline">
          <span className="nvr-set__label">
            {chip('var(--warning-soft)', 'var(--warning)', <Sun size={14} strokeWidth={1.75} />)}
            {t('nvr.settings.mode')}
          </span>
          <div className="nvr-seg" role="group" aria-label={t('nvr.settings.mode')}>
            {modes.map((m) => (
              <button
                key={m}
                type="button"
                className={'nvr-seg__btn' + (p.mode === m ? ' nvr-seg__btn--active' : '')}
                onClick={() => p.onMode(m)}
                aria-pressed={p.mode === m}
              >
                {t(`nvr.settings.mode.${m}`)}
              </button>
            ))}
          </div>
        </div>
        <div className="nvr-set__row nvr-set__row--inline">
          <span className="nvr-set__label">
            {chip('var(--accent-soft)', 'var(--accent)', <Languages size={14} strokeWidth={1.75} />)}
            {t('nvr.settings.language')}
          </span>
          <div className="nvr-select">
            <select
              className="nvr-select__native"
              value={p.language}
              onChange={(e) => p.onLanguage(e.target.value)}
              aria-label={t('nvr.settings.language')}
            >
              <option value="auto">{t('nvr.settings.language.auto')}</option>
              {p.languages.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
            <ChevronDown size={14} strokeWidth={2} className="nvr-select__chevron" aria-hidden="true" />
          </div>
        </div>
        <div className="nvr-set__row">
          <div className="nvr-set__label">
            {chip('var(--accent-soft)', 'var(--accent)', <Palette size={14} strokeWidth={1.75} />)}
            {t('nvr.settings.theme')}
          </div>
          <div className="nvr-swatches">
            {THEME_NAMES.map((n) => (
              <ThemeSwatch
                key={n}
                name={n}
                active={p.theme === n}
                previewMode={resolved}
                ariaLabel={t('nvr.settings.theme.selectAria', { name: THEME_LABELS[n] })}
                onClick={() => {
                  p.onTheme(n);
                  if (p.accentHue === undefined) setLocalHue(defaultHue(n));
                }}
              />
            ))}
          </div>
        </div>
        <div className="nvr-set__row">
          <div className="nvr-accent">
            <div className="nvr-accent__label">
              <span className="nvr-set__label">
                {chip('var(--accent-soft)', 'var(--accent)', <Palette size={14} strokeWidth={1.75} />)}
                {t('nvr.settings.accent')}
                <span className="nvr-accent__dot" style={{ background: previewColor }} aria-hidden="true" />
              </span>
              {p.accentHue !== undefined && (
                <button
                  type="button"
                  className="nvr-btn nvr-btn--ghost nvr-accent__reset"
                  onClick={() => {
                    p.onAccent(undefined);
                    setLocalHue(defaultHue(p.theme));
                  }}
                >
                  {t('nvr.settings.accent.reset')}
                </button>
              )}
            </div>
            <input
              type="range"
              className="nvr-accent__slider"
              min={0}
              max={360}
              value={localHue}
              onChange={(e) => {
                const h = Number(e.target.value);
                setLocalHue(h);
                p.onAccent(h);
              }}
              aria-label={t('nvr.settings.accent.hueAria')}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
