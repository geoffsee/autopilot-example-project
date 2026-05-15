import { useState, useEffect } from "react";
import "./index.css";

import logo from "./logo.svg";
import reactLogo from "./react.svg";

function LiveCounter() {
  const [count, setCount] = useState<number | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    fetch("/api/counter")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: { count: number }) => setCount(data.count))
      .catch((err) => console.error("Failed to fetch counter", err));
  }, []);

  useEffect(() => {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/ws`);

    ws.onopen = () => setConnected(true);
    ws.onerror = (e) => console.error("WebSocket error", e);
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as { type: string; count: number };
        if (msg.type === "counter") setCount(msg.count);
      } catch { /* ignore malformed frames */ }
    };
    ws.onclose = () => setConnected(false);

    return () => ws.close();
  }, []);

  const handleIncrement = () => {
    fetch("/api/counter", { method: "POST" }).catch((err) =>
      console.error("Increment failed", err)
    );
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
    </div>
  );
}

export default App;
