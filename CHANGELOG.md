# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2026-05-19

A complete rewrite. Same idea — make parallel JS painless — with a modern, type-safe
API and production-ready primitives.

### Added

- **Typed event bus** (closes #1) — `Bus<TEvents>` for pub/sub between the main thread and
  workers, with the same `on / once / off / emit / waitFor` API on both sides. Integrated
  into `Thread`, `Pool`, and a `workerBus<Events>()` helper for file-based workers.
- **TypeScript-first** source with generated `.d.ts` declarations.
- **Dual ESM / CJS** build via `tsup`, with proper `exports` map.
- `Thread.fromFunction(fn)` — type-safe inline-function worker.
- `Pool` — fixed-size worker pool with task queue, `maxQueue` backpressure, and `map()`.
- `parallel()` — run an array of inline tasks concurrently with a concurrency cap.
- `mapParallel()` — parallel-map an iterable through a single task with a reused pool.
- `defineWorker(handlers)` — modern typed alternative to `makeExecutable`.
- Per-call `timeout` and `AbortSignal` support on every primitive.
- Structured error hierarchy: `HurriedError`, `TaskError`, `TaskTimeoutError`,
  `TaskAbortedError`, `TerminatedError`.
- Vitest test suite with v8 coverage and 50%+ thresholds enforced in CI.
- GitHub Actions matrix (Node 18 / 20 / 22 × Ubuntu / macOS / Windows) replacing the
  legacy CircleCI config; separate lint, test, coverage, build, examples and release
  workflows.

### Changed

- Minimum Node.js version is now **18.17.0**.
- `Thread.run()` returns a typed `Promise<TResult>` derived from the inline task.
- `Thread.terminate()` is now async and resolves with the worker exit code.
- Error responses from workers are deserialized into real `Error` instances with the
  original message, name, and stack preserved.

### Removed

- CircleCI config (replaced by GitHub Actions).
- Implicit `Math.random()`-based message ids (replaced by a stable counter+timestamp scheme).

### Compatibility

- `makeExecutable(fn, name)` and `Thread.fromFile` / `Thread.fromScript` still work, so
  existing v1 worker modules continue to function.

## [1.1.0] - 2019

Initial public release. See git history for details.

[2.0.0]: https://github.com/yankouskia/hurried/releases/tag/v2.0.0
[1.1.0]: https://github.com/yankouskia/hurried/releases/tag/v1.1.0
