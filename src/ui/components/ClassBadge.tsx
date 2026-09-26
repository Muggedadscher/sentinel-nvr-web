/** Event-class badge: a tinted chip with a Lucide glyph per class; colours are the --nvr-c-* tokens. */
import type { ComponentType } from 'react';
import { User, Car, Bike, PawPrint, Package, Activity } from 'lucide-react';
import { sentinelClassesOf, type SentinelEventClass } from '../../api';
import type { TFn } from '../i18n';

const ICONS: Record<SentinelEventClass, ComponentType<{ size?: number; strokeWidth?: number }>> = {
  person: User,
  car: Car,
  bike: Bike,
  animal: PawPrint,
  package: Package,
  motion: Activity,
};

export function classLabel(t: TFn, cls: SentinelEventClass): string {
  return t(`nvr.class.${cls}`);
}
/** "Person, Vehicle" for an event's distinct classes. */
export function eventLabel(t: TFn, ev: { classes?: string[] | undefined }): string {
  return sentinelClassesOf(ev)
    .map((c) => classLabel(t, c))
    .join(', ');
}

export function ClassBadge({
  cls,
  size = 18,
  title,
}: {
  cls: SentinelEventClass;
  size?: number | undefined;
  title?: string | undefined;
}) {
  const Icon = ICONS[cls];
  return (
    <span
      className={`nvr-cbadge nvr-cbadge--${cls}`}
      style={{ width: size, height: size }}
      title={title}
      aria-hidden={title ? undefined : true}
    >
      <Icon size={Math.round(size * 0.62)} strokeWidth={2.25} />
    </span>
  );
}
/** Badge row for an event (distinct classes, never empty). */
export function EventBadges({ ev, size, t }: { ev: { classes?: string[] | undefined }; size?: number; t: TFn }) {
  return (
    <>
      {sentinelClassesOf(ev).map((c) => (
        <ClassBadge key={c} cls={c} size={size} title={classLabel(t, c)} />
      ))}
    </>
  );
}
