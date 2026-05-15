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
  // Full error-boundary lifecycle (getDerivedStateFromError, componentDidCatch, and the
  // resetKey remount flow) requires a reconciler-driven render. If @testing-library/react
  // with happy-dom/jsdom is added, replace this with render(<ErrorBoundary>) + an
  // error-throwing child to get complete lifecycle coverage at no extra cost.
  // For now, this bypasses the reconciler to verify the fallback render path in isolation.
  const instance = new ErrorBoundary({ children: createElement("span", null, "child") });
  instance.state = { hasError: true, resetKey: 0 };
  const html = renderToString(instance.render() as ReturnType<typeof createElement>);
  expect(html).toContain("Something went wrong.");
});
