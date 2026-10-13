---
name: devkits-dev-from-spec
description: Turn a provider API specification (OpenAPI/Swagger, Postman collection, PDF or HTML docs) into a complete function map and then a billing-platform module, with 100% of the in-scope endpoints accounted for. Use when the user supplies an API spec and wants a module or SDK built from it.
---

# Build a module from an API specification

## 1. Read the spec into a function map
Produce `FUNCTION_MAP.md` before writing code:

| Endpoint | Method | Auth | Request fields | Response / errors | Module function | Status |
| --- | --- | --- | --- | --- | --- | --- |

- Cover every endpoint in scope. Each row ends in a module function or an explicit "out of scope: reason" — never "TBD".
- Record auth (API key header, Bearer/JWT with refresh, HMAC signature with field order, OAuth), base URLs for sandbox and production, rate limits, pagination, idempotency keys and webhook signatures.
- Note mismatches between the spec and observed sandbox behaviour; the sandbox wins, and the note explains why.

## 2. Analysis notes
`ANALYSIS.md`: entities and their lifecycle, which platform module type fits (provisioning, gateway, registrar, addon), money handling (currency precision, rounding, VND has no minor unit), time zones, and error taxonomy mapped to user-facing messages.

## 3. Build
Follow the `devkits-dev-module` skill from its Architecture step. Generate the API client in `lib/` from the function map so every mapped endpoint has one method, typed inputs and mapped errors.

## 4. Done when
- Function map coverage is 100% of in-scope endpoints.
- Each implemented endpoint has a unit test against a recorded or mocked response that matches the spec.
- All gates from `devkits-dev-module` pass with evidence.
