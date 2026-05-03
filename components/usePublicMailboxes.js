"use client";

import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "mailboxsaas:public-mailboxes";
const EVENT_NAME = "mailboxsaas-public-update";

function read() {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function usePublicMailboxes() {
  const [list, setList] = useState([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setList(read());
    setHydrated(true);

    const sync = () => setList(read());
    const onStorage = (e) => {
      if (!e.key || e.key === STORAGE_KEY) sync();
    };
    window.addEventListener(EVENT_NAME, sync);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(EVENT_NAME, sync);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const update = useCallback((updater) => {
    const current = read();
    const next = typeof updater === "function" ? updater(current) : updater;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {}
    setList(next);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event(EVENT_NAME));
    }
  }, []);

  return { list, hydrated, update };
}
