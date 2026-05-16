import { test, expect } from "@playwright/test";

test("page loads with expected title", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Bun \+ React/);
});

test("counter increments on button click", async ({ page }) => {
  await page.goto("/");

  const countEl = page.locator(".count");
  await expect(countEl).toBeVisible();

  const before = await countEl.textContent();
  await page.getByRole("button", { name: "Increment" }).click();

  await expect(countEl).not.toHaveText(before ?? "");
});

test("todo lifecycle: add, complete, delete", async ({ page }) => {
  await page.goto("/");

  const title = `E2E smoke todo ${Date.now()}`;

  // Add a todo
  const input = page.locator('input[placeholder="New todo..."]');
  await input.fill(title);
  await page.locator('.todo-list button[type="submit"]').click();

  // Todo appears in the list
  const todoItem = page.locator(".todo-list li").filter({ hasText: title });
  await expect(todoItem).toBeVisible();

  const todoSpan = todoItem.locator("span");
  await expect(todoSpan).toBeVisible();

  // Mark complete via checkbox
  await todoItem.locator('input[type="checkbox"]').click();
  await expect(todoSpan).toHaveCSS("text-decoration-line", "line-through");

  // Delete the todo
  await todoItem.getByRole("button", { name: "Delete" }).click();
  await expect(todoItem).not.toBeVisible();
});
