/**
 * ExpiryBadge — colour-coded pill showing days until a document expires.
 *
 * Colour rules (Requirement 7.2):
 *  - red    — expires in ≤ 7 days (or already expired)
 *  - amber  — expires in ≤ 30 days
 *  - green  — expires in > 30 days
 *
 * If `expiryDate` is null/undefined the badge is not rendered.
 */

interface Props {
  /** ISO date string (YYYY-MM-DD) or Date object. Pass null/undefined to hide. */
  expiryDate: string | Date | null | undefined;
  className?: string;
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/**
 * Returns the number of calendar days until (or since) the given date,
 * relative to today's UTC midnight.
 */
function daysUntil(expiryDate: string | Date): number {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const expiry = new Date(expiryDate);
  expiry.setUTCHours(0, 0, 0, 0);
  return Math.round((expiry.getTime() - today.getTime()) / MS_PER_DAY);
}

export default function ExpiryBadge({ expiryDate, className = '' }: Props) {
  if (!expiryDate) return null;

  const days = daysUntil(expiryDate);

  let label: string;
  let colorClass: string;

  if (days <= 0) {
    label = 'Expired';
    colorClass = 'bg-red-100 text-red-700 border-red-200';
  } else if (days <= 7) {
    label = `${days}d left`;
    colorClass = 'bg-red-100 text-red-700 border-red-200';
  } else if (days <= 30) {
    label = `${days}d left`;
    colorClass = 'bg-amber-100 text-amber-700 border-amber-200';
  } else {
    label = `${days}d left`;
    colorClass = 'bg-green-100 text-green-700 border-green-200';
  }

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${colorClass} ${className}`}
      title={`Expires: ${new Date(expiryDate).toLocaleDateString()}`}
      aria-label={`Document expires in ${days > 0 ? `${days} days` : 'less than a day or has expired'}`}
    >
      {label}
    </span>
  );
}
