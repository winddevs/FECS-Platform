---
name: security
description: Security threat review procedure. Load when the issue has a security, auth, or payment label, or when the diff touches auth, tokens, secrets, permissions, or user data.
version: 1.0.0
triggers:
  - security label
  - auth change
  - payment change
  - token handling
  - secret exposure
  - permission check
  - user data access
loads_references_on_demand:
  - security-checklist.md
---

# Security Review

## Core rule

Assume the input is hostile. Assume the dependency is compromised. Verify both.

## Use when

- Issue has labels: `security`, `auth`, `payment`, `breaking-change` with auth/data scope.
- Diff touches: authentication, authorization, token generation/validation, secret handling, user PII, payment flows, permission checks, or external API credentials.
- Critical Reviewer is assigned.

## Do not use when

- The change is purely cosmetic, docs-only, or internal tooling with no user data access.

## Procedure

1. Identify the trust boundary — where does untrusted input enter the system?
2. Check input validation at every entry point (API, queue, webhook, CLI).
3. Check for secret/token/PII leakage in logs, error responses, or API responses.
4. Check authentication: is identity verified before any privileged action?
5. Check authorization: is the caller permitted to perform this specific action on this specific resource?
6. Check for injection vectors: SQL, shell, template, path traversal.
7. Check dependency calls: are credentials scoped minimally? Are timeouts set?
8. Check rollback safety: can this change be reverted without data exposure?
9. Load `security-checklist.md` for high-risk changes (payment, auth, PII).

## Required evidence for approval

- Trust boundary identified and documented.
- Input validation confirmed at boundary.
- No secret/PII in logs or responses (verified by log/response inspection).
- Auth and authz checks confirmed present and tested.
- No injection vectors found, or mitigations documented.
- Rollback plan exists.

## Block when

- Auth or authz check is missing or bypassable.
- Secret, token, or PII appears in a log line, error message, or API response.
- Input from an untrusted source reaches a sensitive operation without validation.
- No test covers the security-relevant behavior.
- Rollback would expose data or leave the system in an inconsistent auth state.
