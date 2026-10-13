---
name: devkits-fix-bug
description: Fix a bug in a billing-platform module or DevKits code by reproducing it first, finding the root cause, adding a failing test, then the minimal fix and regression checks. Use for bug reports, tickets, errors from logs or "it stopped working" requests.
---

# Fix a bug: reproduce → root cause → test → fix

1. **Classify severity** — Critical (money, data loss, security, outage), High, Medium, Low. Critical in production: propose a mitigation (disable the feature, roll back) before the fix.
2. **Reproduce** — exact steps, inputs, platform/module versions, logs. No reproduction, no patch: if it cannot be reproduced, say what evidence is missing.
3. **Root cause** — follow the data from input to failure. State the cause in one sentence and why the code allowed it. Check whether the same pattern exists elsewhere in the module.
4. **Failing test** — write a test (unit test on `lib/`, or a scripted reproduction) that fails for the reported reason.
5. **Minimal fix** — change only what the root cause needs. No drive-by refactors.
6. **Validate** — the new test passes; the existing suite passes; re-run the security and lifecycle checks from `devkits-audit-module` on the touched files.
7. **Report** — cause, fix (diff summary), tests run with results, remaining risk, and whether data created while the bug existed needs repair.
