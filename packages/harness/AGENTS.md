# Harness

Optional Node companion for HarnessAgent sessions. The browser app does not spawn it. Never bundle a JavaScript runtime into the Iced desktop binary.

- Keep the package backend-neutral.
- Persist only opaque, non-secret resume state. Pi's in-memory `just-bash` cannot recover across process restarts.
- Expose the bounded JSONL host protocol. The Iced desktop app does not launch this companion (`desktop/AGENTS.md`).
- stdout carries only protocol messages: write them through the writer `reserveProtocolOutput()` returns, and let other output, including npm runs Pi starts, go to stderr (`tests/output.test.ts`).
- `bun run test:tools` runs this package's tests together with the repo tooling suites.
