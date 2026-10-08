import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, Clock, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import { useNotificationStore } from '@/store/notificationStore';
import * as notificationsApi from '@/api/notificationsApi';
import type { NotificationItem } from '@/api/notificationsApi';
import { AnimatePresence, motion } from 'framer-motion';

export default function NotificationBell() {
  const { unreadCount, fetchUnreadCount, decrement } = useNotificationStore();
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetchUnreadCount();
  }, [fetchUnreadCount]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleToggle = async () => {
    const nextState = !isOpen;
    setIsOpen(nextState);
    if (nextState) {
      setLoading(true);
      try {
        const data = await notificationsApi.list(false);
        setNotifications(data.slice(0, 5));
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }
  };

  const handleMarkRead = async (e: React.MouseEvent, item: NotificationItem) => {
    e.stopPropagation();
    if (item.read) return;
    try {
      await notificationsApi.markRead(item._id);
      setNotifications((prev) =>
        prev.map((n) => (n._id === item._id ? { ...n, read: true } : n))
      );
      decrement();
    } catch {
      // ignore
    }
  };

  const handleItemClick = (item: NotificationItem) => {
    setIsOpen(false);
    if (!item.read) {
      notificationsApi.markRead(item._id).catch(() => {});
      decrement();
    }
    if (item.documentId) {
      navigate(`/documents/${item.documentId}`);
    } else {
      navigate('/notifications');
    }
  };

  const getItemIcon = (type: NotificationItem['type']) => {
    switch (type) {
      case 'expiry_alert':
        return <AlertTriangle className="h-4 w-4 text-amber-500" />;
      case 'processing_complete':
        return <CheckCircle className="h-4 w-4 text-emerald-500" />;
      case 'processing_failed':
        return <XCircle className="h-4 w-4 text-rose-500" />;
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={handleToggle}
        className="relative rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
      >
        <Bell className="h-5 w-5" />
        <AnimatePresence>
          {unreadCount > 0 && (
            <motion.span
              key="badge"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 500, damping: 25 }}
              className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground"
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </motion.span>
          )}
        </AnimatePresence>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-xl border border-border bg-card shadow-lg z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center justify-between border-b border-border px-4 py-3 bg-muted/40">
            <h3 className="font-semibold text-sm text-foreground">Notifications</h3>
            <button
              onClick={() => {
                setIsOpen(false);
                navigate('/notifications');
              }}
              className="text-xs text-primary font-medium hover:underline"
            >
              View all
            </button>
          </div>

          <div className="max-h-80 overflow-y-auto divide-y divide-border">
            {loading ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                Loading notifications…
              </div>
            ) : notifications.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                No notifications yet.
              </div>
            ) : (
              notifications.map((item) => (
                <div
                  key={item._id}
                  onClick={() => handleItemClick(item)}
                  className={`flex items-start gap-3 p-3 text-xs transition-colors cursor-pointer hover:bg-muted/50 ${
                    !item.read ? 'bg-primary/5 font-medium' : ''
                  }`}
                >
                  <div className="mt-0.5 flex-shrink-0">{getItemIcon(item.type)}</div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <p className="text-foreground leading-snug">{item.message}</p>
                    <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {new Date(item.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  {!item.read && (
                    <button
                      onClick={(e) => handleMarkRead(e, item)}
                      title="Mark as read"
                      className="text-muted-foreground hover:text-primary transition-colors p-1"
                    >
                      <CheckCheck className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
