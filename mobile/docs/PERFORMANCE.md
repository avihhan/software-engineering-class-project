# Aura Fit Mobile Web Performance

This file tracks baseline performance and optimization guardrails for
`aura-fit/mobile`.

## Baseline (before optimization)

Build command:

```bash
npm run build
```

Recorded output:

- `index-*.js`: **591.43 kB** (gzip **177.75 kB**) in a single main chunk
- CSS: **15.42 kB** (gzip **3.54 kB**)
- Build warning: chunk larger than 500 kB

## Current (after optimization pass)

Key changes:

- Route-level lazy loading in `src/App.tsx`
- Chart modules isolated to lazy chart components
- Manual chunking in `vite.config.ts` (`vendor`, `charts`)
- Cached stale-while-refresh API reads for top pages

Build output:

- `index-*.js` (entry): **10.13 kB** (gzip **3.57 kB**)
- `vendor-*.js`: **321.58 kB** (gzip **106.25 kB**)
- `charts-*.js`: **231.84 kB** (gzip **61.03 kB**)
- Page chunks: mostly **~2–6 kB**
- CSS: **16.33 kB** (gzip **3.82 kB**)

The critical improvement is that the initial entry chunk dropped from ~591 kB
to ~10 kB, so first route interactivity is significantly faster.

## Verify locally

### Bundle report

```bash
npm run perf:report
```

### Production sanity

```bash
npm run build
npm run preview
```

### Dev sanity

```bash
npm run dev
```

## Manual Web Vitals checks (dev + prod)

Use Chrome DevTools Lighthouse (mobile + desktop) and capture:

- LCP
- INP
- CLS
- Total JS downloaded on first route

Recommended checkpoints:

1. Login route
2. Dashboard first visit
3. First visit to Body Metrics chart section
4. Route switches between Dashboard, Workouts, Nutrition

## Guardrails (regression prevention)

- Keep route pages lazy-loaded in `src/App.tsx`.
- Keep `recharts` usage inside lazy chart-only components.
- Use `apiFetchJson` + `getApiCache` for list/dashboard reads where instant
  revisit UX matters.
- Check `npm run perf:report` before merging major UI/data changes.
- Keep static hosting compression enabled (Brotli/Gzip) in deployment.
