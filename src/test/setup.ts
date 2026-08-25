// What jsdom does not implement, for the handful of files that opt into it.
//
// This runs for every test file, including the node-environment majority, so
// each shim checks for a DOM first rather than assuming one.
//
// `PageScrollbar` watches the body
// with one — the page's height changes when a Task is completed out of a
// filtered list, not only when someone scrolls — and jsdom has no
// implementation, so every test that rendered the app shell died on a
// ReferenceError the moment the component was mounted. The component is right
// to use it; the environment is what is missing it.
class ResizeObserverStub implements ResizeObserver {
  // Deliberately inert. A stub that invented resize callbacks would make
  // assertions pass or fail for reasons no browser would reproduce; the sizes
  // themselves are asserted in e2e, where layout is real.
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

// Reached through `globalThis` rather than `window`, because TypeScript knows
// the DOM lib declares ResizeObserver and narrows an `in` check on `window` to
// `never` — the check is about the runtime, which the types cannot see.
const runtime = globalThis as { ResizeObserver?: typeof ResizeObserver };

if (typeof window !== "undefined" && runtime.ResizeObserver === undefined) {
  runtime.ResizeObserver = ResizeObserverStub;
}

// `scrollIntoView`, for the same reason and with the same rule: jsdom does no
// layout, so it implements none of the scrolling API. The List picker keeps
// the option its arrow keys are on in view (§13.27) — correct in a browser,
// and a TypeError here.
//
// Inert like the observer above. What is asserted in the tests is which option
// the keys moved to; whether it was scrolled into view needs a viewport, and
// that is e2e's to check.
if (typeof window !== "undefined" && typeof Element.prototype.scrollIntoView !== "function") {
  Element.prototype.scrollIntoView = function scrollIntoViewStub() {};
}
