import React, { useState, useEffect, useRef, useContext, createContext, useCallback, FormEvent } from "react";
import "./index.css";

import logo from "./logo.svg";
import reactLogo from "./react.svg";

type ActivityEntry = { id: number; action: string; timestamp: string };

type WsMessage =
  | { type: "counter"; count: number }
  | { type: "activity"; entry: ActivityEntry }
  | { type: "activity_history"; entries: ActivityEntry[] };

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

function ActivityFeed() {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const { connected, subscribe } = useContext(WsContext);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    return subscribe((msg) => {
      if (msg.type === "activity_history") {
        setEntries(msg.entries);
      } else if (msg.type === "activity") {
        setEntries((prev) => [msg.entry, ...prev].slice(0, 50));
      }
    });
  }, [subscribe]);

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
          entries.map((e) => (
            <li key={e.id}>
              <span className="action">{e.action}</span>
              <span className="timestamp">{new Date(e.timestamp).toLocaleTimeString()}</span>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

type Todo = { id: number; title: string; completed: number; created_at: string };

function TodoList() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/todos")
      .then((r) => r.json())
      .then((data: { todos: Todo[] }) => setTodos(data.todos))
      .catch(() => setError("Failed to load todos"));
  }, []);

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    const title = input.trim();
    if (!title) return;
    const res = await fetch("/api/todos", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title }),
    });
    if (!res.ok) return;
    const data = (await res.json()) as { todo: Todo };
    setTodos((prev) => [...prev, data.todo]);
    setInput("");
  };

  const handleToggle = async (todo: Todo) => {
    const res = await fetch(`/api/todos/${todo.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ completed: todo.completed ? 0 : 1 }),
    });
    if (!res.ok) return;
    const data = (await res.json()) as { todo: Todo };
    setTodos((prev) => prev.map((t) => (t.id === todo.id ? data.todo : t)));
  };

  const handleDelete = async (id: number) => {
    const res = await fetch(`/api/todos/${id}`, { method: "DELETE" });
    if (!res.ok) return;
    setTodos((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <div className="todo-list">
      <h2>Todos</h2>
      {error && <p className="error">{error}</p>}
      <form onSubmit={handleAdd} style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="New todo..."
          style={{ flex: 1, padding: "0.4rem 0.6rem" }}
        />
        <button type="submit">Add</button>
      </form>
      <ul style={{ listStyle: "none", padding: 0 }}>
        {todos.length === 0 ? (
          <li style={{ opacity: 0.5 }}>No todos yet</li>
        ) : (
          todos.map((todo) => (
            <li key={todo.id} style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.4rem" }}>
              <input
                type="checkbox"
                checked={todo.completed === 1}
                onChange={() => handleToggle(todo)}
              />
              <span style={{ flex: 1, textDecoration: todo.completed ? "line-through" : "none", opacity: todo.completed ? 0.5 : 1 }}>
                {todo.title}
              </span>
              <button onClick={() => handleDelete(todo.id)} aria-label="Delete">✕</button>
            </li>
          ))
        )}
      </ul>
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
        <TodoList />
        <ActivityFeed />
      </div>
    </WsProvider>
  );
}

export default App;
