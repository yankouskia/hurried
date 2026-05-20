# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.2] - 2026-05-20

Maintenance release — no API or runtime changes. Drop-in upgrade from 2.0.1.

### Changed

- **CI hardening.** The `Release` workflow is now idempotent — it checks whether
  the version is already on npm and skips publishing instead of hard-failing,
  so re-runs on existing tags pass cleanly.

### Security

- **Docs site:** pinned `serialize-javascript` to `^7.0.5` via an `overrides`
  entry, clearing the high-severity RCE / DoS advisories
  (GHSA-5c6j-r48x-rmvq, GHSA-qj8w-gfj5-8c6v). `npm audit` reports **0
  vulnerabilities** for the documentation site. This does not affect the
  published library, which has **zero runtime dependencies**.

## [2.0.1] - 2026-05-19

Polish release — no API changes. Drop-in upgrade from 2.0.0.

### Changed

- **`parallel()` simplified** — spawns a `Thread` directly per task instead of
  building a per-task `Pool` of size one. Same behaviour, two layers fewer.
- **`Pool` constructor** uses a single typed `spawn` helper instead of inline
  double-casts at every call site, making the code easier to read and audit.
- **README** now leads with a 3-line "hello world" demo before introducing the
  bus, so newcomers see the simplest possible usage first.

### Added

- Docusaurus-powered documentation site at
  https://yankouskia.github.io/hurried/, with guides, a patterns gallery, a
  full API reference, a migration guide, and an FAQ.
- `.npmrc` added to `.gitignore` as a safety net for accidental token commits.

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

[2.0.2]: https://github.com/yankouskia/hurried/releases/tag/v2.0.2
[2.0.1]: https://github.com/yankouskia/hurried/releases/tag/v2.0.1
[2.0.0]: https://github.com/yankouskia/hurried/releases/tag/v2.0.0
[1.1.0]: https://github.com/yankouskia/hurried/releases/tag/v1.1.0
