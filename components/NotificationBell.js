"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function NotificationBell() {
  const [notifications, setNotifications] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [closedPopupIds, setClosedPopupIds] = useState([]);
  const dropdownRef = useRef(null);
  const router = useRouter();

  const fetchNotifications = async () => {
    try {
      const res = await fetch("/api/user/notifications");
      if (res.ok) {
        const data = await res.json();
        setNotifications(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();

    // Poll every minute
    const interval = setInterval(fetchNotifications, 60000);
    return () => clearInterval(interval);
  }, []);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const unreadCount = notifications.filter((n) => !n.isRead).length;
  const latestUnread = notifications.find((n) => !n.isRead);
  const showPopup = latestUnread && !isOpen && !closedPopupIds.includes(latestUnread._id);

  const markAsRead = async (id, link) => {
    try {
      await fetch("/api/user/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      // Optimistic update
      setNotifications(notifications.map(n => n._id === id ? { ...n, isRead: true } : n));
      setIsOpen(false);
      
      if (link) {
        router.push(link);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const markAllAsRead = async () => {
    try {
      await fetch("/api/user/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAll: true }),
      });
      setNotifications(notifications.map(n => ({ ...n, isRead: true })));
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-surface-500 hover:bg-surface-100 rounded-xl transition"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full ring-2 ring-white"></span>
        )}
      </button>

      {/* Floating latest notification popup */}
      {showPopup && (
        <div 
          onClick={() => markAsRead(latestUnread._id, latestUnread.link)}
          className="absolute top-12 right-0 w-72 bg-white rounded-2xl shadow-brand-xl border border-surface-200 z-40 p-3 cursor-pointer hover:bg-surface-50 transition-all animate-fade-in group"
        >
          <div className="flex justify-between items-start gap-2">
            <div className="flex items-start gap-2.5">
              <div className={`mt-1 w-2 h-2 rounded-full shrink-0 ${
                latestUnread.type === 'success' ? 'bg-green-500' :
                latestUnread.type === 'error' ? 'bg-red-500' :
                'bg-brand-500'
              }`}></div>
              <div>
                <p className="text-xs font-bold text-surface-800 line-clamp-1">{latestUnread.title}</p>
                <p className="text-[11px] text-surface-500 line-clamp-3 mt-0.5 leading-relaxed">{latestUnread.message}</p>
              </div>
            </div>
            <button 
              onClick={(e) => {
                e.stopPropagation();
                setClosedPopupIds(prev => [...prev, latestUnread._id]);
              }}
              className="text-surface-400 hover:text-surface-600 rounded-lg p-1 shrink-0 bg-surface-100/0 hover:bg-surface-200 transition-colors"
              title="Dismiss"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>
      )}

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-brand-xl border border-surface-100 overflow-hidden z-50 animate-slide-down">
          <div className="flex items-center justify-between px-4 py-3 border-b border-surface-100 bg-surface-50/50">
            <h3 className="text-sm font-bold text-surface-800">Notifications</h3>
            {unreadCount > 0 && (
              <button 
                onClick={markAllAsRead}
                className="text-[11px] font-medium text-brand-600 hover:text-brand-700"
              >
                Mark all as read
              </button>
            )}
          </div>
          
          <div className="max-h-[350px] overflow-y-auto">
            {loading ? (
              <div className="p-6 text-center text-sm text-surface-500">Loading...</div>
            ) : notifications.length === 0 ? (
              <div className="p-6 text-center text-sm text-surface-500">
                You have no notifications yet.
              </div>
            ) : (
              <div className="divide-y divide-surface-100">
                {notifications.map((notif) => (
                  <div
                    key={notif._id}
                    onClick={() => markAsRead(notif._id, notif.link)}
                    className={`p-4 cursor-pointer hover:bg-surface-50 transition ${
                      notif.isRead ? "opacity-75" : "bg-brand-50/30"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                        notif.type === 'success' ? 'bg-green-100 text-green-600' :
                        notif.type === 'warning' || notif.type === 'error' ? 'bg-red-100 text-red-600' :
                        'bg-blue-100 text-blue-600'
                      }`}>
                        {notif.type === 'success' ? (
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                        ) : notif.type === 'warning' || notif.type === 'error' ? (
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                        ) : (
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        )}
                      </div>
                      <div>
                        <h4 className={`text-sm font-semibold mb-0.5 ${!notif.isRead ? "text-surface-900" : "text-surface-600"}`}>
                          {notif.title}
                        </h4>
                        <p className="text-xs text-surface-500 leading-relaxed">
                          {notif.message}
                        </p>
                        <span className="text-[10px] text-surface-400 mt-2 block font-medium">
                          {new Date(notif.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
