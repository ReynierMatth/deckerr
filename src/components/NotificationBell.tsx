import { useState, useRef, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Check, CheckCheck } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  AppNotification,
} from '../services/api';

const EMPTY_NOTIFICATIONS: AppNotification[] = [];

/** Human-friendly short relative time (e.g. "3m", "2h", "5d"). */
function shortTimeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (seconds < 60) return 'now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo`;
  return `${Math.floor(days / 365)}y`;
}

/** In-app notifications bell with unread badge, realtime updates, and a dropdown/panel. */
export default function NotificationBell() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: notifications } = useQuery({
    queryKey: ['notifications', user?.id],
    enabled: !!user,
    queryFn: () => getNotifications(user!.id),
  });

  const items = notifications ?? EMPTY_NOTIFICATIONS;
  const unreadCount = items.filter((n) => !n.read).length;

  // Realtime: refresh notifications on any change for this user.
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`notifications-changes-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['notifications', user.id] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, queryClient]);

  // Close the panel on outside click.
  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  if (!user) return null;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['notifications', user.id] });
  };

  const handleNotificationClick = async (notification: AppNotification) => {
    if (!notification.read) {
      try {
        await markNotificationRead(notification.id);
        invalidate();
      } catch (error) {
        console.error('Error marking notification read:', error);
      }
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsRead(user.id);
      invalidate();
    } catch (error) {
      console.error('Error marking all notifications read:', error);
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Notifications"
        className="relative flex items-center justify-center p-2 rounded-md text-gray-300 hover:text-white hover:bg-gray-700 transition-smooth"
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold leading-none">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className="fixed left-0 right-0 top-14 mx-2 md:absolute md:left-auto md:right-0 md:top-full md:mx-0 md:mt-2 md:w-80 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-[120] glass-effect overflow-hidden"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
            <span className="text-sm font-semibold text-white">Notifications</span>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-smooth"
              >
                <CheckCheck size={14} />
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-[70vh] md:max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <p className="text-gray-400 text-center py-10 text-sm">No notifications</p>
            ) : (
              <ul className="divide-y divide-gray-700/60">
                {items.map((notification) => (
                  <li key={notification.id}>
                    <button
                      type="button"
                      onClick={() => handleNotificationClick(notification)}
                      className={`w-full text-left px-4 py-3 flex gap-3 transition-smooth active:bg-gray-700 hover:bg-gray-700/70 ${
                        notification.read ? '' : 'bg-gray-700/40'
                      }`}
                    >
                      <span
                        className={`mt-1.5 shrink-0 w-2 h-2 rounded-full ${
                          notification.read ? 'bg-transparent' : 'bg-blue-500'
                        }`}
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-start justify-between gap-2">
                          <span
                            className={`text-sm break-words ${
                              notification.read ? 'text-gray-300' : 'text-white font-medium'
                            }`}
                          >
                            {notification.title}
                          </span>
                          <span className="shrink-0 text-[11px] text-gray-500 whitespace-nowrap">
                            {shortTimeAgo(notification.created_at)}
                          </span>
                        </span>
                        {notification.body && (
                          <span className="mt-0.5 block text-xs text-gray-400 break-words">
                            {notification.body}
                          </span>
                        )}
                      </span>
                      {notification.read && (
                        <Check size={14} className="mt-1 shrink-0 text-gray-600" aria-hidden="true" />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
