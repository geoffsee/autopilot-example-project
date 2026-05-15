import { expect, test } from "bun:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { ErrorBoundary } from "../src/ErrorBoundary";

test("ErrorBoundary has getDerivedStateFromError static method", () => {
  expect(typeof ErrorBoundary.getDerivedStateFromError).toBe("function");
  expect(ErrorBoundary.getDerivedStateFromError(new Error())).toEqual({ hasError: true });
});

test("ErrorBoundary renders children when no error", () => {
  const html = renderToString(
    createElement(ErrorBoundary, null, createElement("span", null, "ok"))
  );
  expect(html).toContain("ok");
});

test("ErrorBoundary renders fallback when hasError state is true", () => {
  // Error boundaries are client-side; we test fallback by calling render() directly.
  const instance = new ErrorBoundary({ children: createElement("span", null, "child") });
  instance.state = { hasError: true };
  const html = renderToString(instance.render() as ReturnType<typeof createElement>);
  expect(html).toContain("Something went wrong.");
});
