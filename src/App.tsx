import { useState, useEffect, useRef } from "react";
import "./index.css";

import logo from "./logo.svg";
import reactLogo from "./react.svg";

type ActivityEntry = { action: string; timestamp: string };

function LiveCounter() {
  const [count, setCount] = useState<number | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    fetch("/api/counter")
      .then((r) => r.json())
      .then((data: { count: number }) => setCount(data.count));
  }, []);

  useEffect(() => {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/ws`);

    ws.onopen = () => setConnected(true);
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data as string) as { type: string; count: number };
      if (msg.type === "counter") setCount(msg.count);
    };
    ws.onclose = () => setConnected(false);

    return () => ws.close();
  }, []);

  const handleIncrement = () => {
    fetch("/api/counter", { method: "POST" });
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

function ActivityFeed() {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    fetch("/api/activity")
      .then((r) => r.json())
      .then((data: { entries: ActivityEntry[] }) => setEntries(data.entries));
  }, []);

  useEffect(() => {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/ws`);

    ws.onopen = () => setConnected(true);
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data as string) as { type: string; entry: ActivityEntry };
      if (msg.type === "activity") {
        setEntries((prev) => [msg.entry, ...prev].slice(0, 50));
      }
    };
    ws.onclose = () => setConnected(false);

    return () => ws.close();
  }, []);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = 0;
    }
  }, [entries]);

  return (
    <div className="activity-feed">
      <h2>Activity Feed</h2>
      <p>Status: {connected ? "Connected" : "Disconnected"}</p>
      <ul ref={listRef}>
        {entries.length === 0 ? (
          <li className="empty">No activity yet</li>
        ) : (
          entries.map((e, i) => (
            <li key={i}>
              <span className="action">{e.action}</span>
              <span className="timestamp">{new Date(e.timestamp).toLocaleTimeString()}</span>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

export function App() {
  return (
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
  );
}

export default App;
