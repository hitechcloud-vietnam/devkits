---
name: devkits-dev-module
description: Build a new billing-platform module (HostBill, WHMCS, WordPress/WooCommerce, Blesta, FOSSBilling, ClientExec, WiseCP) from scratch — provisioning, payment gateway, registrar, addon, notification and more — with quality gates before it is called done. Use when asked to create, scaffold or develop such a module or plugin.
---

# Develop a billing-platform module

Write the module for *this* provider's real API. Similar modules are reading material, never a starting folder.

## 1. Intake (ask only what is missing)
- **Platform** and version (HostBill, WHMCS 8.x, WooCommerce, …).
- **Module type**: provisioning (hosting, VPS, dedicated, licence), payment gateway, registrar, addon, notification, fraud, SSO/MFA, report, widget, hook.
- **Provider API**: docs, OpenAPI/Postman, sandbox credentials (names only — never paste secrets into code or chat logs).
- **Slug**: lowercase `^[a-z][a-z0-9_]{2,40}$`; it drives file, class and function names.

## 2. Architecture before code
Write a short `ARCHITECTURE.md` in the module folder:
- The platform contract the module implements, with every method signature and return convention (table in §5).
- File inventory: main class/file, `lib/` API client, templates, language files, hooks, cron, DB schema (with indexes on looked-up columns).
- API client policy: timeouts, retries only on idempotent calls, error → user message mapping, TLS verification on.
- Which states the module must handle: active, pending, suspended, terminated, fraud, cancelled.

## 3. Implement
- Keep the platform glue thin; put HTTP and signing logic in `lib/` so it can be unit-tested.
- Never hard-code credentials, hosts or test fixtures. Read settings from the module configuration.
- Validate every input, escape every template output, use prepared statements, add CSRF protection to POST handlers, mask secrets in logs.
- Short universal snippets (an HMAC routine) may be adapted with attribution; anything longer is re-derived from the API docs.

## 4. Gates before "done"
| Gate | Pass when |
|---|---|
| Syntax | `php -l` on every file; autoload works; naming matches platform rules |
| Security | 0 critical/high: no secrets, TLS verify on, no `eval`, prepared SQL, CSRF, escaping, timeouts, rate limits on login/webhooks |
| Review | Contract complete, return types per platform, language strings present, install/upgrade/uninstall leave no residue, edge cases (empty, huge, unicode, timezone) |
| Functional | Unit tests on `lib/`; staging smoke test of the full lifecycle (create → suspend → unsuspend → terminate, or capture → refund → webhook, or register → renew → transfer) |
| Docs & legal | README (install, configure, troubleshoot), CHANGELOG, LICENSE, copyright headers, no personal data in fixtures |

Report each gate with evidence (command output, test summary). A gate you could not run is reported as not run, never as passed.

## 5. HostBill ↔ WHMCS contract cheat sheet
| Concern | HostBill (class methods) | WHMCS (`{slug}_` functions) |
|---|---|---|
| Provisioning | `Create`, `Suspend`, `Unsuspend`, `Terminate`, `ChangePackage`, `ChangePassword`, `Renew` → `true` or `addError()` | `CreateAccount`, `SuspendAccount`, … → `'success'` or an error string |
| Settings | `$configuration` property | `{slug}_ConfigOptions()` / `{slug}_config()` |
| Connection test | `testConnection(): bool` | `{slug}_TestConnection()` → `['success'=>bool,'error'=>…]` |
| Payments | `capture_form`, `capture`, `refund`, callback | `{slug}_link`, `{slug}_capture`, `{slug}_refund`, `callback/{slug}.php` |
| Registrar | `Register`, `Transfer`, `Renew` | `RegisterDomain`, `TransferDomain`, `RenewDomain` → array or `['error'=>…]` |
| Lifecycle | `install()`, `upgrade($from)`, `uninstall()` | `{slug}_activate`, `{slug}_upgrade`, `{slug}_deactivate` |
| Language | `$lang['english'][…]` | `lang/english.php` |

Confirm details against the platform's current developer docs before relying on this table.
