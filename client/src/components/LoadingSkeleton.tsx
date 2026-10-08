/**
 * LoadingSkeleton — shape-matched skeleton placeholders for loading states.
 *
 * Exports:
 *  - `DocumentCardSkeleton`    — matches a document grid card layout
 *  - `NotificationItemSkeleton` — matches a notification list row layout
 *  - `LoadingSkeleton` (default) — convenience wrapper accepting `variant` and `count` props
 *
 * Requirements 7.5, 16.1
 */

/** Reusable shimmer block */
function Shimmer({ className }: { className: string }) {
  return <div className={`animate-pulse rounded bg-muted ${className}`} />;
}

// ---------------------------------------------------------------------------
// DocumentCardSkeleton
// Mirrors the visual structure of a document grid card:
//   ┌─────────────────────────────────────┐
//   │  [icon area]  [title bar          ] │
//   │  ─────────────────────────────────  │
//   │  [metadata row]                     │
//   │  [metadata row]                     │
//   │  [tag pill] [tag pill]              │
//   └─────────────────────────────────────┘
// ---------------------------------------------------------------------------
export function DocumentCardSkeleton() {
  return (
    <div
      className="rounded-lg border border-border bg-card p-4 flex flex-col gap-3"
      aria-hidden="true"
      role="presentation"
    >
      {/* Header: icon + title */}
      <div className="flex items-center gap-3">
        {/* Document type icon area */}
        <Shimmer className="h-10 w-10 rounded-md flex-shrink-0" />
        {/* Title bar */}
        <div className="flex-1 flex flex-col gap-1.5">
          <Shimmer className="h-4 w-3/4" />
          <Shimmer className="h-3 w-1/2" />
        </div>
      </div>

      {/* Divider */}
      <Shimmer className="h-px w-full bg-muted-foreground/10" />

      {/* Metadata rows */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Shimmer className="h-3 w-1/4" />
          <Shimmer className="h-3 w-1/3" />
        </div>
        <div className="flex items-center gap-2">
          <Shimmer className="h-3 w-1/4" />
          <Shimmer className="h-3 w-2/5" />
        </div>
      </div>

      {/* Tag pills */}
      <div className="flex gap-2">
        <Shimmer className="h-5 w-14 rounded-full" />
        <Shimmer className="h-5 w-10 rounded-full" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// NotificationItemSkeleton
// Mirrors the visual structure of a notification list row:
//   ┌────────────────────────────────────────────┐
//   │  ●  [text line long            ]           │
//   │     [text line short    ]                  │
//   └────────────────────────────────────────────┘
// ---------------------------------------------------------------------------
export function NotificationItemSkeleton() {
  return (
    <div
      className="flex items-start gap-3 px-4 py-3 border-b border-border"
      aria-hidden="true"
      role="presentation"
    >
      {/* Icon circle */}
      <Shimmer className="h-9 w-9 rounded-full flex-shrink-0 mt-0.5" />

      {/* Text lines */}
      <div className="flex-1 flex flex-col gap-2 pt-1">
        <Shimmer className="h-3.5 w-4/5" />
        <Shimmer className="h-3 w-2/5" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LoadingSkeleton — convenience wrapper
// ---------------------------------------------------------------------------
export type LoadingSkeletonVariant = 'document-card' | 'notification-item';

export interface LoadingSkeletonProps {
  /** Which skeleton shape to render */
  variant: LoadingSkeletonVariant;
  /** Number of skeleton items to render (default: 1) */
  count?: number;
}

/**
 * Renders `count` skeleton placeholders of the specified `variant`.
 *
 * @example
 * // Show 6 document card skeletons while loading
 * <LoadingSkeleton variant="document-card" count={6} />
 *
 * @example
 * // Show 5 notification row skeletons
 * <LoadingSkeleton variant="notification-item" count={5} />
 */
export default function LoadingSkeleton({
  variant,
  count = 1,
}: LoadingSkeletonProps) {
  const items = Array.from({ length: Math.max(1, count) }, (_, i) => i);

  if (variant === 'document-card') {
    return (
      <>
        {items.map((i) => (
          <DocumentCardSkeleton key={i} />
        ))}
      </>
    );
  }

  return (
    <>
      {items.map((i) => (
        <NotificationItemSkeleton key={i} />
      ))}
    </>
  );
}
