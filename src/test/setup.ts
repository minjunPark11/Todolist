// What jsdom does not implement, for the handful of files that opt into it.
//
// This runs for every test file, including the node-environment majority, so
// each shim checks for a DOM first rather than assuming one.
//
// ResizeObserver is the only entry so far. `PageScrollbar` watches the body
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
