# Historical snapshots

Dated point-in-time reports, kept for provenance. **None of these describes the
current system** — they were written before the 2026-08-31 audit and the
2026-09-01 redesign, and their quantitative claims have all drifted.

For the current state, read:

- [`../../README.md`](../../README.md) — setup, architecture, auth, security status
- [`../audit/2026-08-31-findings.md`](../audit/2026-08-31-findings.md) — what the audit found
- [`../audit/2026-08-31-work-completed.md`](../audit/2026-08-31-work-completed.md) — what was fixed and what was deferred
- [`../audit/2026-09-01-ux-redesign.md`](../audit/2026-09-01-ux-redesign.md) — the redesign and pilot enablement

| File | Written | Superseded because |
|---|---|---|
| `2025-11-02-build-status.md` | Nov 2025 | Its lint, test, model and route counts were wrong when audited and have drifted again since. Its job — "does this build, lint, typecheck and test?" — is now answered continuously by CI. |
| `2025-11-02-system-status.md` | Nov 2025 | Hardcodes policy row counts and an API credit balance, which are stale by design. Describes `policyType`, a column that no longer exists. |
| `2025-11-02-lawyer-persona.md` | Nov 2025 | Describes an attorney persona the shipped prompt does not use. The persona is database-driven and editable at `/admin/prompt`; see the header inside the file. |
| `2026-08-31-design-brief.md` | Aug 2026 | A brief handed to a designer, describing the pre-redesign codebase in present tense. Most of what it calls a problem is fixed; see the header inside the file. |

They are kept rather than deleted because the audit findings reference them by
line number, and because they record what the project believed about itself at a
point in time — which is part of the audit trail.
