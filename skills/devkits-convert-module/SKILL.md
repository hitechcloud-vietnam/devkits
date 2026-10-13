---
name: devkits-convert-module
description: Convert a module between billing platforms (WHMCS ↔ HostBill ↔ Blesta ↔ FOSSBilling ↔ ClientExec ↔ WiseCP) by mapping every source function to the target contract and rewriting it natively, with wire-format parity on provider API calls. Use for porting or migrating modules between platforms.
---

# Convert a module to another platform

## 1. Map before writing
`CONVERSION_MAP.md` with one row per source function:

| Source function | Target function | Return convention change | Settings/lang mapping | Notes |
| --- | --- | --- | --- | --- |

Every source function maps to a target function or is explicitly dropped with a reason. See the HostBill ↔ WHMCS table in `devkits-dev-module` §5; verify other targets against their developer docs.

## 2. Rewrite natively
Write the target module from scratch in the target platform's idioms (class methods vs prefixed functions, error reporting, schema API, template engine). Do not transliterate line by line: error handling, settings storage and lifecycle hooks differ between platforms.

## 3. Wire-format parity
Requests sent to the provider must be byte-for-byte equivalent in meaning: same endpoints, parameters, signing order, currency precision and time zone. Capture source and target requests in tests and compare them.

## 4. Data migration (when the source has history)
Plan how existing services, custom fields, tokens and logs move: a dry-run script, counts before/after, and a rollback path. Never migrate stored card data; re-tokenise through the gateway.

## 5. Done when
All mapped functions implemented, parity tests pass, the target passes the gates in `devkits-dev-module`, and the migration dry run (if any) reconciles.
