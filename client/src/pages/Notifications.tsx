import { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import {
  Bell,
  CheckCheck,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Filter,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';
import * as notificationsApi from '@/api/notificationsApi';
import type { NotificationItem } from '@/api/notificationsApi';
import { useNotificationStore } from '@/store/notificationStore';
import LoadingSkeleton from '@/components/LoadingSkeleton';

type FilterType = 'all' | 'expiry_alert' | 'processing_complete' | 'processing_failed';

export default function Notifications() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const { fetchUnreadCount, reset } = useNotificationStore();
  const navigate = useNavigate();

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await notificationsApi.list(false);
      setNotifications(data);
    } catch {
      setError('Failed to load notifications. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  const handleMarkAllRead = async () => {
    try {
      await notificationsApi.markAllRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      reset();
      toast.success('All notifications marked as read.');
    } catch {
      toast.error('Failed to mark all as read.');
    }
  };

  const handleMarkSingleRead = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await notificationsApi.markRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n._id === id ? { ...n, read: true } : n))
      );
      fetchUnreadCount();
    } catch {
      // ignore
    }
  };

  const handleItemClick = (item: NotificationItem) => {
    if (!item.read) {
      notificationsApi.markRead(item._id).then(() => fetchUnreadCount()).catch(() => {});
    }
    if (item.documentId) {
      navigate(`/documents/${item.documentId}`);
    }
  };

  const filteredNotifications = useMemo(() => {
    if (activeFilter === 'all') return notifications;
    return notifications.filter((n) => n.type === activeFilter);
  }, [notifications, activeFilter]);

  const getIcon = (type: NotificationItem['type']) => {
    switch (type) {
      case 'expiry_alert':
        return <AlertTriangle className="h-5 w-5 text-amber-500" />;
      case 'processing_complete':
        return <CheckCircle2 className="h-5 w-5 text-emerald-500" />;
      case 'processing_failed':
        return <XCircle className="h-5 w-5 text-rose-500" />;
    }
  };

  const unreadExist = notifications.some((n) => !n.read);

  return (
    <div className="p-6 sm:p-8 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Bell className="h-6 w-6 text-primary" />
            Notifications
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Stay updated on document processing status and upcoming expiry warnings.
          </p>
        </div>

        {unreadExist && (
          <button
            type="button"
            onClick={handleMarkAllRead}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3.5 py-2 text-xs font-semibold text-foreground hover:bg-muted transition-colors"
          >
            <CheckCheck className="h-4 w-4 text-primary" />
            Mark all as read
          </button>
        )}
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground mr-1" />
        {[
          { id: 'all', label: 'All' },
          { id: 'expiry_alert', label: 'Expiry Alerts' },
          { id: 'processing_complete', label: 'Processing Complete' },
          { id: 'processing_failed', label: 'Processing Failed' },
        ].map((f) => (
          <button
            key={f.id}
            onClick={() => setActiveFilter(f.id as FilterType)}
            className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
              activeFilter === f.id
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-muted text-muted-foreground border-border hover:bg-muted/80'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Content list */}
      <div className="space-y-3">
        {loading && <LoadingSkeleton variant="notification-item" count={4} />}

        {!loading && error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-destructive flex items-center justify-between">
            <span>{error}</span>
            <button
              onClick={loadNotifications}
              className="inline-flex items-center gap-1 text-xs font-semibold hover:underline"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Retry
            </button>
          </div>
        )}

        {!loading && !error && filteredNotifications.length === 0 && (
          <div className="rounded-xl border border-dashed border-border bg-muted/20 py-16 text-center space-y-2">
            <Bell className="h-10 w-10 text-muted-foreground/40 mx-auto" />
            <p className="font-medium text-muted-foreground text-sm">
              No notifications matching your filter.
            </p>
          </div>
        )}

        {!loading &&
          !error &&
          filteredNotifications.map((item) => (
            <div
              key={item._id}
              onClick={() => handleItemClick(item)}
              className={`group flex items-start gap-4 rounded-xl border p-4 transition-all ${
                item.documentId ? 'cursor-pointer hover:shadow-md hover:border-primary/40' : ''
              } ${
                !item.read
                  ? 'border-primary/30 bg-primary/5 dark:bg-primary/10'
                  : 'border-border bg-card'
              }`}
            >
              <div className="mt-0.5 p-2 rounded-lg bg-background border border-border flex-shrink-0">
                {getIcon(item.type)}
              </div>

              <div className="flex-1 min-w-0 space-y-1">
                <p className={`text-sm leading-relaxed ${!item.read ? 'font-semibold text-foreground' : 'text-foreground/90'}`}>
                  {item.message}
                </p>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {new Date(item.createdAt).toLocaleString()}
                  </span>
                  {item.documentId && (
                    <span className="text-primary opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 font-medium">
                      View document <ArrowRight className="h-3 w-3" />
                    </span>
                  )}
                </div>
              </div>

              {!item.read && (
                <button
                  onClick={(e) => handleMarkSingleRead(e, item._id)}
                  title="Mark as read"
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-background hover:text-foreground transition-colors"
                >
                  <CheckCheck className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
      </div>
    </div>
  );
}
