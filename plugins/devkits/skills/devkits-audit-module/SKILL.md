---
name: devkits-audit-module
description: Audit an existing HostBill, WHMCS or WordPress module for syntax, security, platform-contract conformance and lifecycle correctness, and report findings by severity with file and line evidence. Optional safe fixes only when asked. Use for "review/audit/check this module" requests.
---

# Audit a billing-platform module

## Scope
Read the whole module: main class or function file, `lib/`, templates, hooks, callbacks, cron, schema, language files, composer/npm manifests. Identify platform, version and module type first.

## Checks
1. **Syntax & structure** — lints cleanly; naming matches platform rules; no stray entry files; version bumped on upgrade.
2. **Security** — hard-coded secrets or hosts; TLS verification disabled; `eval`/dynamic includes; SQL built by concatenation; missing input validation or output escaping; missing CSRF on POST; missing permission checks; no timeouts; webhooks without signature verification or replay protection; secrets or card data in logs; vulnerable dependencies.
3. **Contract** — every required platform method exists with the right return convention; errors surface through the platform's mechanism instead of exceptions or `die()`.
4. **Lifecycle** — create/suspend/unsuspend/terminate (or capture/refund/callback, register/renew/transfer) handle retries, partial failure and already-in-state cases; install/upgrade/uninstall are idempotent and clean up.
5. **Operations** — logging without secrets, graceful degradation when the provider is down, N+1 queries, missing indexes.

## Report
| Severity | File:line | Finding | Why it matters | Fix |
| --- | --- | --- | --- | --- |

Severities: **Critical** (exploitable or loses money/data), **High**, **Medium**, **Low**. Summarise counts first. Only report what you verified in the code; mark suspicions as "needs confirmation".

## Fixing
Apply fixes only when asked, and only those with no behavioural risk (escaping, timeouts, prepared statements, removing debug output). List anything that changes behaviour as a proposal for a human to approve.
