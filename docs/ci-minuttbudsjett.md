# CI-minuttbudsjett

`.github/scripts/ci-minuttbudsjett.mjs` gates Playwright e2e testing in `.github/workflows/pr-check.yml` based on GitHub Actions quota usage. This document explains when and why e2e is skipped.

## Why the guard exists

GitHub Actions Free-plan provides **2000 minutes/month on private repositories** (account-wide quota). Without a guard, heavy CI usage could exhaust the quota mid-month and block all CI pipelines — lint, typecheck, vitest, build — leaving the team unable to ship changes.

**Key principle:** Drift (scheduled cron jobs) is protected; e2e is sacrificed first if quota becomes tight, because core CI (lint/typecheck/test/build) must never be cut.

## How it works

The watcher runs before `npm ci` in `pr-check.yml` and queries `GET repos/{owner}/{repo}/actions/runs` for the current calendar month (UTC). It calculates:

```
run e2e  ⟺  consumed_minutes + e2e_cost ≤ available_budget
available_budget = quota_limit − drift_reserve
```

See the constants block at the top of `.github/scripts/ci-minuttbudsjett.mjs` for current values.

## Public repos (like this template)

**This repository (`klubb-app`) is public,** so GitHub Actions minutes are free and unlimited. The watcher detects this via the `REPO_PRIVAT` environment variable and **always allows e2e** with no API call. Template users on a public repository see no quota effects.

## If you fork to a private repository

If you fork this template to run on a **private repository**, the watcher will activate:

1. **Before the first run,** adjust the constants in `.github/scripts/ci-minuttbudsjett.mjs` to match your account's usage:
   - `KVOTE_MIN` — your plan's monthly quota (2000 for Free)
   - `DRIFTSRESERVE_MIN` — minutes to reserve for drift jobs (cron workflows). Measure your scheduled jobs' monthly cost and add headroom.
   - `E2E_KOST_MIN` — estimated additional minutes for running Playwright. Ships at 10; measure your own after a few runs and adjust.

2. **Monitor the step summary** in your Actions. Every PR run shows a budget table (see `tabell()` function in the script) that breaks down consumption and the e2e decision.

3. **If e2e is skipped,** check the PR's workflow run details. The `CI-minuttbudsjett` step in the job summary explains why. It's not a failure — core CI still ran. Note: e2e skipping includes security tests in `e2e/rls/` (Row Level Security coverage).

## Two run scopes: `pull_request` vs `push`

`pr-check.yml` runs on **both** pull requests and pushes to `main`, with different scopes:

| Event | Scope | What runs |
|---|---|---|
| `pull_request` | FULL | lint, typecheck, vitest, build **+ Playwright e2e** |
| `push` to `main` | CORE | lint, typecheck, vitest, build |

E2e is deliberately left out on `push`. If the change arrived via a PR, e2e already passed there; re-running it on every merge roughly doubles consumption for no new information. The point of the `push` trigger is to catch changes that **bypass** pull requests entirely — a direct commit to `main` would otherwise get no CI at all.

**The practical rule: if a change touches code, put it through a pull request.** The core gate on `main` is a safety net, not a substitute — code pushed directly never gets e2e coverage.

### `skipped` means three different things

`E2e (Playwright) → skipped` is now ambiguous across three scenarios. Check which:

**First, check the event type:**

```bash
gh run view <run-id> --json event --jq '.event'
```

- `push` → expected. Push runs never include e2e. If the commit came from a merged PR, the entire core gate is also skipped (~15 sec) — it already ran on the PR.
- `pull_request` → either the risk guard or budget guard cut it; see below.

**For pull requests, distinguish the reason:**

```bash
gh run view <run-id> --json jobs \
  --jq '.jobs[].steps[] | select(.name|startswith("E2e skipped")) | select(.conclusion=="success") | .name'
```

| Scenario | Message | Meaning | Action |
|---|---|---|---|
| `push` event | (no marker) | Expected. Push runs never run e2e. | Normal — no action |
| `pull_request`, low risk | `E2e skipped — low risk (#663)` | No changed file can affect a running flow (pure docs, CI scripts, tests). | Normal — no action |
| `pull_request`, budget cut | `E2e skipped — budget guard cut it` | The budget watcher disabled e2e. This run is **not** e2e-covered. | Unknown, not green — escalate |

The `Avgjør e2e-omfang` step writes a `::notice::` explaining which case it was. Check `$GITHUB_STEP_SUMMARY` for detailed tables from both guards when you need the details.

## Measuring e2e cost

After enabling this template on a private repo, run a few PRs with e2e enabled (early in the month when quota is plentiful). Note the job duration with and without e2e, and update `E2E_KOST_MIN` accordingly.

For reference, the reference deployment measured this on a suite of ~100 e2e tests:
- Full job (core gate + e2e): ~14.5 min
- Core gate alone (lint, typecheck, vitest, build): ~5.5 min
- Measured e2e overhead: ~8.8 min (Playwright step, Chromium install, Supabase wait)
- Constant set to: **10** min — measured value plus margin for `retries: 1`

Note that `supabase start` barely shows up in that breakdown: the workflow starts it in the background before the fast steps, so container startup overlaps with lint/test/build instead of adding to the total.

Your deployment's cost may differ based on test count and Chromium cache freshness. **If your suite grows substantially, measure again** — an undersized constant lets the guard approve runs it has no budget for.

## Risk-based skipping (#663)

`.github/scripts/e2e-risiko.mjs` is a **second, independent guard** that runs **before** the budget watcher. It asks a different question: not "do we have budget", but "can any of these changes affect a running workflow at all". A documentation edit or CI-script change cannot, so it should not spend 10 minutes proving it (#663).

**The safe-list is the source — not duplicated here.** See `TRYGGE_MAPPER` and `TRYGGE_FILER` at the top of `.github/scripts/e2e-risiko.mjs` for the current, authoritative list. `e2e/**` and `playwright.config.ts` are deliberately EXCLUDED, even though `__tests__/` is safe — a change in the e2e suite itself can break tests in ways a filename check cannot catch (a broken spec that never runs), and must always trigger full coverage.

**`public/sw.js` special rule:** the file is NOT generally safe (it controls the service worker cache your app actually uses), but `npm run stamp-versjon` routinely writes a new `CACHE_VERSION` bump to it on each version stamp — often the ONLY change in an otherwise documentation-heavy PR. The guard accepts `public/sw.js` as safe ONLY WHEN the entire patch consists of lines matching `CACHE_VERSION_LINJE` (`const CACHE_VERSION = '...'`). A single other changed line, or a missing `patch` field from the API, makes the file risky again.

**Scope: path-based, not content-based.** A PR that only changes a code comment regresses to requiring e2e. That's a deliberate scope limit: a "this is just comments" heuristic must handle eslint-disable directives, `@ts-expect-error` (which actually affects behavior), multiline block comments, JSX comments, and strings containing `//`. Missing in that direction costs full coverage on a real behavior change — the expensive failure this guard exists to prevent. The gain is a handful of PRs per month; the price is a fragile heuristic exactly where misses matter most. `public/sw.js` above is the only content-based exception, and is deliberately narrow: one exact, machine-generated line pattern.

**Fails OPEN, opposite of the budget watcher — and intentionally.** The budget watcher fails CLOSED (skips e2e) because overshooting quota hurts the quota guard's own purpose. The risk watcher fails OPEN (runs e2e) because undershooting risk coverage would be the exact failure mode #663 prevents. An API error, empty file list, or mismatch between fetched and expected file count (`ENDREDE_FILER` from `pull_request.changed_files`) thus always results in `risk=true`.

**Not a flakiness mitigation.** Flaky e2e tests (sporadic failures from timing/browser issues) stand separate from this guard. A PR touching app code still runs the FULL suite regardless of recent flakiness. Gating is never the answer to test flakiness — that belongs in test design, not risk classification.

## Constants

- **`KVOTE_MIN`** — Your Actions quota per month (not per user/repo). Free-plan: 2000.
- **`DRIFTSRESERVE_MIN`** — Minutes never available for e2e. Protects scheduled workflows (cron jobs) from being starved by PR CI.
- **`CI_BUDSJETT_MIN`** — `KVOTE_MIN - DRIFTSRESERVE_MIN`; the pool available for PR CI (lint/typecheck/test/build/e2e).
- **`E2E_KOST_MIN`** — Estimated additional minutes for Playwright e2e. Rounding up is safe; rounding down risks quota overshoot.
- **`VARSEL_ANDEL`** (0.8) — Threshold at which the step summary warns "approaching limit" (when consumption ≥ 80% of available budget).
- **`VED_MAALEFEIL`** — Fail-safe when GitHub API is unreachable: `'kutt'` (disable e2e, play it safe) or custom value for other behavior.

## Testing locally

The guard is in `GITHUB_OUTPUT` and `GITHUB_STEP_SUMMARY` only — it doesn't affect local `npm run dev` or `npx playwright test`. You can run e2e locally anytime.

## For deployment platforms

If you deploy to a platform with GitHub Actions integration (e.g., Vercel), you may also see quota checks there. This watcher is independent and guards *your repository's* quota only.
