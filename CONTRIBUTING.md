# Engineering checks

Run these commands before opening a pull request:

- `npm run typecheck` — strict TypeScript checking.
- `npm run lint` — ESLint correctness and React Hook checks.
- `npm test` — the normal test suite.
- `npm run test:coverage` — tests with regression coverage floors.
- `npm run build` — production build.
- `npm run check:bundle` — largest JavaScript bundle regression budget.
- `npm run check:architecture` — PR-06 layer boundaries and the `App.tsx` line budget.
- `npm run perf:50k` — reproducible local benchmark; it deliberately has no CI timing threshold.
- `npm run verify` — all deterministic quality gates.

Coverage floors prevent material regression; they are not a quality score. The bundle budget similarly prevents unexpected growth rather than requiring a particular optimization strategy.
