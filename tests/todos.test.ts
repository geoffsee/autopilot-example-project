import { test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import {
  setupTodos,
  getTodos,
  createTodo,
  updateTodo,
  deleteTodo,
  handleGetTodos,
  handleCreateTodo,
  handleUpdateTodo,
  handleDeleteTodo,
} from "../src/todo-routes";

let db: Database;

beforeEach(() => {
  db = new Database(":memory:");
  setupTodos(db);
});

afterEach(() => {
  db.close();
});

// --- GET ---

test("getTodos returns empty array initially", () => {
  expect(getTodos(db)).toEqual([]);
});

test("handleGetTodos returns 200 with empty todos array", async () => {
  const res = handleGetTodos(db);
  expect(res.status).toBe(200);
  const body = (await res.json()) as { todos: unknown[] };
  expect(body.todos).toEqual([]);
});

test("getTodos returns all created todos", () => {
  createTodo(db, "First");
  createTodo(db, "Second");
  const todos = getTodos(db);
  expect(todos.length).toBe(2);
  expect(todos[0].title).toBe("First");
  expect(todos[1].title).toBe("Second");
});

// --- POST ---

test("createTodo returns a todo with id and defaults", () => {
  const todo = createTodo(db, "Buy milk");
  expect(todo.id).toBeGreaterThan(0);
  expect(todo.title).toBe("Buy milk");
  expect(todo.completed).toBe(0);
  expect(typeof todo.created_at).toBe("string");
});

test("handleCreateTodo returns 201 with created todo", async () => {
  const req = new Request("http://localhost/api/todos", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "Buy milk" }),
  });
  const res = await handleCreateTodo(req, db);
  expect(res.status).toBe(201);
  const body = (await res.json()) as { todo: { id: number; title: string; completed: number } };
  expect(body.todo.title).toBe("Buy milk");
  expect(body.todo.completed).toBe(0);
  expect(body.todo.id).toBeGreaterThan(0);
});

test("handleCreateTodo returns 400 if title missing", async () => {
  const req = new Request("http://localhost/api/todos", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  const res = await handleCreateTodo(req, db);
  expect(res.status).toBe(400);
});

test("handleCreateTodo returns 400 if title is empty string", async () => {
  const req = new Request("http://localhost/api/todos", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "" }),
  });
  const res = await handleCreateTodo(req, db);
  expect(res.status).toBe(400);
});

test("handleCreateTodo returns 400 if body is not JSON content-type", async () => {
  const req = new Request("http://localhost/api/todos", {
    method: "POST",
    headers: { "content-type": "text/plain" },
    body: "not json",
  });
  const res = await handleCreateTodo(req, db);
  expect(res.status).toBe(400);
});

test("handleCreateTodo returns 400 if title is not a string", async () => {
  const req = new Request("http://localhost/api/todos", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: 42 }),
  });
  const res = await handleCreateTodo(req, db);
  expect(res.status).toBe(400);
});

// --- PATCH ---

test("updateTodo toggles completed to 1", () => {
  const todo = createTodo(db, "Test");
  const updated = updateTodo(db, todo.id, { completed: 1 });
  expect(updated?.completed).toBe(1);
});

test("updateTodo toggles completed back to 0", () => {
  const todo = createTodo(db, "Test");
  updateTodo(db, todo.id, { completed: 1 });
  const updated = updateTodo(db, todo.id, { completed: 0 });
  expect(updated?.completed).toBe(0);
});

test("updateTodo updates title", () => {
  const todo = createTodo(db, "Old title");
  const updated = updateTodo(db, todo.id, { title: "New title" });
  expect(updated?.title).toBe("New title");
});

test("updateTodo returns null for non-existent id", () => {
  const result = updateTodo(db, 9999, { completed: 1 });
  expect(result).toBeNull();
});

test("handleUpdateTodo returns 200 with updated todo", async () => {
  const todo = createTodo(db, "Test todo");
  const req = new Request(`http://localhost/api/todos/${todo.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ completed: 1 }),
  });
  const res = await handleUpdateTodo(req, db, todo.id);
  expect(res.status).toBe(200);
  const body = (await res.json()) as { todo: { completed: number } };
  expect(body.todo.completed).toBe(1);
});

test("handleUpdateTodo returns 404 for non-existent id", async () => {
  const req = new Request("http://localhost/api/todos/9999", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ completed: 1 }),
  });
  const res = await handleUpdateTodo(req, db, 9999);
  expect(res.status).toBe(404);
});

test("handleUpdateTodo returns 400 for invalid id (NaN)", async () => {
  const req = new Request("http://localhost/api/todos/abc", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ completed: 1 }),
  });
  const res = await handleUpdateTodo(req, db, NaN);
  expect(res.status).toBe(400);
});

test("handleUpdateTodo returns 400 for invalid completed value", async () => {
  const todo = createTodo(db, "Test");
  const req = new Request(`http://localhost/api/todos/${todo.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ completed: 2 }),
  });
  const res = await handleUpdateTodo(req, db, todo.id);
  expect(res.status).toBe(400);
});

// --- DELETE ---

test("deleteTodo returns true on success", () => {
  const todo = createTodo(db, "Test");
  expect(deleteTodo(db, todo.id)).toBe(true);
  expect(getTodos(db)).toEqual([]);
});

test("deleteTodo returns false for non-existent id", () => {
  expect(deleteTodo(db, 9999)).toBe(false);
});

test("handleDeleteTodo returns 200 on success", () => {
  const todo = createTodo(db, "Test");
  const res = handleDeleteTodo(db, todo.id);
  expect(res.status).toBe(200);
});

test("handleDeleteTodo returns 404 for non-existent id", () => {
  const res = handleDeleteTodo(db, 9999);
  expect(res.status).toBe(404);
});

test("handleDeleteTodo returns 400 for invalid id (NaN)", () => {
  const res = handleDeleteTodo(db, NaN);
  expect(res.status).toBe(400);
});
