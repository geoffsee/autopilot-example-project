import { Database } from "bun:sqlite";

export type Todo = {
  id: number;
  title: string;
  completed: number;
  created_at: string;
};

export function setupTodos(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS todos (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      title      TEXT NOT NULL,
      completed  INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    )
  `);
}

export function getTodos(db: Database): Todo[] {
  return db
    .query<Todo, []>("SELECT id, title, completed, created_at FROM todos ORDER BY id ASC")
    .all();
}

export function createTodo(db: Database, title: string): Todo {
  const created_at = new Date().toISOString();
  const result = db.run(
    "INSERT INTO todos (title, completed, created_at) VALUES (?, 0, ?)",
    [title, created_at]
  );
  return { id: Number(result.lastInsertRowid), title, completed: 0, created_at };
}

export function updateTodo(
  db: Database,
  id: number,
  patch: { title?: string; completed?: number }
): Todo | null {
  if (patch.title !== undefined) {
    db.run("UPDATE todos SET title = ? WHERE id = ?", [patch.title, id]);
  }
  if (patch.completed !== undefined) {
    db.run("UPDATE todos SET completed = ? WHERE id = ?", [patch.completed, id]);
  }
  return (
    db
      .query<Todo, [number]>("SELECT id, title, completed, created_at FROM todos WHERE id = ?")
      .get(id) ?? null
  );
}

export function deleteTodo(db: Database, id: number): boolean {
  const result = db.run("DELETE FROM todos WHERE id = ?", [id]);
  return result.changes > 0;
}

export function handleGetTodos(db: Database): Response {
  return Response.json({ todos: getTodos(db) });
}

export async function handleCreateTodo(req: Request, db: Database): Promise<Response> {
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return Response.json({ error: "Content-Type must be application/json" }, { status: 400 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return Response.json({ error: "Body must be an object" }, { status: 400 });
  }
  const { title } = body as Record<string, unknown>;
  if (typeof title !== "string" || title.trim() === "") {
    return Response.json({ error: "title must be a non-empty string" }, { status: 400 });
  }
  const todo = createTodo(db, title.trim());
  return Response.json({ todo }, { status: 201 });
}

export async function handleUpdateTodo(
  req: Request,
  db: Database,
  id: number
): Promise<Response> {
  if (!Number.isInteger(id)) {
    return Response.json({ error: "Invalid id" }, { status: 400 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return Response.json({ error: "Body must be an object" }, { status: 400 });
  }
  const patch = body as Record<string, unknown>;
  const update: { title?: string; completed?: number } = {};
  if ("title" in patch) {
    if (typeof patch.title !== "string" || patch.title.trim() === "") {
      return Response.json({ error: "title must be a non-empty string" }, { status: 400 });
    }
    update.title = patch.title.trim();
  }
  if ("completed" in patch) {
    if (patch.completed !== 0 && patch.completed !== 1) {
      return Response.json({ error: "completed must be 0 or 1" }, { status: 400 });
    }
    update.completed = patch.completed as number;
  }
  const todo = updateTodo(db, id, update);
  if (!todo) {
    return Response.json({ error: "Todo not found" }, { status: 404 });
  }
  return Response.json({ todo });
}

export function handleDeleteTodo(db: Database, id: number): Response {
  if (!Number.isInteger(id)) {
    return Response.json({ error: "Invalid id" }, { status: 400 });
  }
  const deleted = deleteTodo(db, id);
  if (!deleted) {
    return Response.json({ error: "Todo not found" }, { status: 404 });
  }
  return Response.json({ success: true });
}
