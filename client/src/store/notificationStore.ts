import { create } from 'zustand';
import * as notificationsApi from '@/api/notificationsApi';

interface NotificationStore {
  unreadCount: number;
  setUnreadCount: (count: number) => void;
  fetchUnreadCount: () => Promise<void>;
  decrement: () => void;
  reset: () => void;
}

export const useNotificationStore = create<NotificationStore>((set) => ({
  unreadCount: 0,
  setUnreadCount: (unreadCount) => set({ unreadCount }),
  fetchUnreadCount: async () => {
    try {
      const list = await notificationsApi.list(true);
      set({ unreadCount: list.length });
    } catch {
      // ignore
    }
  },
  decrement: () => set((state) => ({ unreadCount: Math.max(0, state.unreadCount - 1) })),
  reset: () => set({ unreadCount: 0 }),
}));
