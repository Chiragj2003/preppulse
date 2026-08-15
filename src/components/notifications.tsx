"use client";

import { useState, useRef, useEffect } from "react";
import { Bell } from "lucide-react";
import { Surface } from "./ui/surface";

export function Notifications() {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // Mocked notifications for now, but easily hooked up to a DB later
  const [notifications, setNotifications] = useState([
    {
      id: 1,
      title: "Daily Word: Killa",
      message: "Gen Z slang meaning 'excellent' or 'highly effective'. Try using it in your next speech!",
      time: "2 hours ago",
      isUnread: true,
    },
    {
      id: 2,
      title: "Streak maintained!",
      message: "You're on a 3 day streak. Keep it up to earn more tokens.",
      time: "1 day ago",
      isUnread: false,
    },
  ]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative flex size-11 items-center justify-center rounded-full text-ink-2 hover:bg-black/5 hover:text-ink dark:hover:bg-white/10 transition-colors"
        aria-label="Notifications"
      >
        <Bell className="size-4" />
        {notifications.some(n => n.isUnread) && (
          <span className="absolute right-3 top-3 size-2 rounded-full bg-accent ring-2 ring-void" />
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-80 z-50">
          <Surface material="liquid" radius="lg" className="overflow-hidden border border-white/10 shadow-[var(--shadow-lift)]">
            <div className="p-4 border-b border-line/50">
              <h3 className="t-heading text-sm">Notifications</h3>
            </div>
            <div className="max-h-96 overflow-y-auto p-2 flex flex-col gap-1">
              {notifications.map((note) => (
                <div
                  key={note.id}
                  onClick={() => {
                    setNotifications(prev => prev.map(n => n.id === note.id ? { ...n, isUnread: false } : n));
                    setIsOpen(false);
                  }}
                  className={`p-3 rounded-md cursor-pointer transition-colors hover:bg-black/5 dark:hover:bg-white/5 ${note.isUnread ? "bg-accent/5" : ""}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <p className={`text-sm font-medium ${note.isUnread ? "text-accent" : "text-ink"}`}>{note.title}</p>
                    <span className="text-[10px] text-ink-3">{note.time}</span>
                  </div>
                  <p className="text-xs text-ink-2 leading-relaxed">{note.message}</p>
                </div>
              ))}
            </div>
          </Surface>
        </div>
      )}
    </div>
  );
}
