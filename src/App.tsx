import React, { useState, useEffect, useRef, useContext, createContext, useCallback } from "react";
import "./index.css";

import logo from "./logo.svg";
import reactLogo from "./react.svg";

type ActivityEntry = { id: number; action: string; timestamp: string };

type WsMessage =
  | { type: "counter"; count: number }
  | { type: "activity"; entry: ActivityEntry }
  | { type: "activity_history"; entries: ActivityEntry[]; total: number };

type WsContextValue = {
  connected: boolean;
  subscribe: (handler: (msg: WsMessage) => void) => () => void;
};

const WsContext = createContext<WsContextValue>({
  connected: false,
  subscribe: () => () => {},
});

function WsProvider({ children }: { children: React.ReactNode }) {
  const [connected, setConnected] = useState(false);
  const handlersRef = useRef<Set<(msg: WsMessage) => void>>(new Set());

  useEffect(() => {
    let ws: WebSocket;
    let delay = 1000;
    let cancelled = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

    function connect() {
      const proto = location.protocol === "https:" ? "wss" : "ws";
      ws = new WebSocket(`${proto}://${location.host}/ws`);
      ws.onopen = () => { setConnected(true); delay = 1000; };
      ws.onerror = (e) => console.error("WebSocket error", e);
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string) as WsMessage;
          handlersRef.current.forEach((h) => h(msg));
        } catch { /* ignore malformed frames */ }
      };
      ws.onclose = () => {
        setConnected(false);
        if (!cancelled) {
          reconnectTimer = setTimeout(connect, delay);
          delay = Math.min(delay * 2, 30_000);
        }
      };
    }

    connect();
    return () => { cancelled = true; clearTimeout(reconnectTimer); ws?.close(); };
  }, []);

  const subscribe = useCallback((handler: (msg: WsMessage) => void) => {
    handlersRef.current.add(handler);
    return () => handlersRef.current.delete(handler);
  }, []);

  return <WsContext.Provider value={{ connected, subscribe }}>{children}</WsContext.Provider>;
}

function LiveCounter() {
  const [count, setCount] = useState<number | null>(null);
  const { connected, subscribe } = useContext(WsContext);

  useEffect(() => {
    fetch("/api/counter")
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((data: { count: number }) => setCount(data.count))
      .catch((err) => console.error("Failed to fetch counter", err));
  }, []);

  useEffect(() => {
    return subscribe((msg) => {
      if (msg.type === "counter") setCount(msg.count);
    });
  }, [subscribe]);

  const handleIncrement = () => {
    fetch("/api/counter", { method: "POST" }).catch((err) => console.error("Increment failed", err));
  };

  return (
    <div className="live-counter">
      <h2>Live Counter</h2>
      <p>Status: {connected ? "Connected" : "Disconnected"}</p>
      <p className="count">{count ?? "—"}</p>
      <button onClick={handleIncrement}>Increment</button>
    </div>
  );
}

const PAGE_SIZE = 20;

function ActivityFeed() {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { connected, subscribe } = useContext(WsContext);
  const listRef = useRef<HTMLUListElement>(null);

  const fetchPage = useCallback(async (beforeId: number | null) => {
    const url = beforeId != null
      ? `/api/counter/history?limit=${PAGE_SIZE}&before=${beforeId}`
      : `/api/counter/history?limit=${PAGE_SIZE}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return await res.json() as { entries: ActivityEntry[]; total: number };
  }, []);

  useEffect(() => {
    return subscribe((msg) => {
      if (msg.type === "activity_history") {
        setEntries((prev) => prev.length > 0 ? prev : msg.entries);
        setTotal((prevTotal) => prevTotal > 0 ? prevTotal : msg.total);
      } else if (msg.type === "activity") {
        setEntries((prev) => [msg.entry, ...prev].slice(0, 200));
        setTotal((t) => t + 1);
      }
    });
  }, [subscribe]);

  const handleLoadMore = async () => {
    setLoadingMore(true);
    setLoadError(null);
    try {
      const cursor = entries[entries.length - 1]?.id ?? null;
      const { entries: page, total: newTotal } = await fetchPage(cursor);
      setEntries((prev) => [...prev, ...page]);
      setTotal(newTotal);
    } catch {
      setLoadError("Failed to load more entries.");
    } finally {
      setLoadingMore(false);
    }
  };

  const hasMore = entries.length < total;

  return (
    <div className="activity-feed">
      <h2>Activity Feed</h2>
      <p>Status: {connected ? "Connected" : "Disconnected"}</p>
      <ul ref={listRef}>
        {entries.length === 0 ? (
          <li className="empty">No activity yet</li>
        ) : (
          entries.map((e) => (
            <li key={e.id}>
              <span className="action">{e.action}</span>
              <span className="timestamp">{new Date(e.timestamp).toLocaleTimeString()}</span>
            </li>
          ))
        )}
      </ul>
      {loadError && <p className="load-error">{loadError}</p>}
      {hasMore && (
        <button onClick={handleLoadMore} disabled={loadingMore}>
          {loadingMore ? "Loading…" : `Load more (${total - entries.length} remaining)`}
        </button>
      )}
    </div>
  );
}

export function App() {
  return (
    <WsProvider>
      <div className="app">
        <div className="logo-container">
          <img src={logo} alt="Bun Logo" className="logo bun-logo" />
          <img src={reactLogo} alt="React Logo" className="logo react-logo" />
        </div>

        <h1>Bun + React</h1>
        <p>Deployed to GitHub Pages.</p>
        <LiveCounter />
        <ActivityFeed />
      </div>
    </WsProvider>
  );
}

export default App;
