# Diwan Professional Preview — Readiness Audit

**Audit date:** 2026-11-20  
**Repository:** `Diwanpro/Diwan.app`  
**Audit branch:** `preview/diwan-professional-demo-20261120`  
**Audit baseline:** `review/diwan-fix-01f-migration-recovery-20261120` at `5f81e55a23e74764aab9953027d98686ae5da6cc`  
**Release status:** NOT READY — implementation in progress. No merge to `main` and no deployment authorized.

## Purpose and non-negotiable constraints

Prepare an isolated, polished demonstration for one or two lawyers, using synthetic data only. Keep the existing production/main branch unchanged until the owner explicitly approves a merge. Do not copy real client/case data into the demo. Do not describe local role switching as real multi-user authentication or shared synchronization.

## Evidence reviewed

- `index.html`: primary single-page application; large inline HTML/CSS/JavaScript codebase.
- `manifest.json`: Arabic/RTL PWA manifest.
- `sw.js`: offline-first service worker; preview branch now uses the distinct cache namespace `diwan-preview-professional-20261120`.
- `README.md`: describes local browser storage, offline operation, encryption and broad feature set.
- `diwan-guide-unified-v9.7.html`: user guide.
- `diwan-deadlines.test.js`, `diwan-idle-lock.test.js`, `.github/workflows/diwan-regression.yml`: automated regression coverage and CI.
- PR #5: idle-lock credential verification and event-handling fix, still open at audit time.
- PR #6: interrupted storage-migration recovery, still draft/open at audit time. Latest reported CI run on its head passed: 289 passed, 0 failed (293 test/suite entries; 49 suites).

The audit is based on repository inspection and automated-test metadata. A full real-browser manual run has NOT yet been completed. “Present in code” does not mean “accepted end-to-end.”

## Feature-by-feature initial matrix

Status definitions:
- **Present / verify:** implementation evidence exists; functional end-to-end acceptance is still required.
- **Partial / gap:** some implementation exists, but the agreed workflow or control is not proven complete.
- **Missing / not verified:** no sufficient evidence of a complete isolated demo or accepted behavior.
- **Blocker:** must be resolved before the demo is shared.

| Area | Initial status | Evidence / gap | Acceptance requirement |
|---|---|---|---|
| Navigation and screen organization | Present / verify | Main app has grouped navigation, responsive layout and Arabic/French UI. Documentation and code comments describe navigation group counts differently. | Review every primary screen at desktop and mobile sizes; harmonize labels, breadcrumbs/back paths, empty states and Arabic/French text. |
| Matters/cases and parties | Present / verify | Case creation form supports multiple parties, procedural roles, case type, court and assignment fields. | Create, edit, view, link and archive sample matters without orphaned or duplicate records. |
| Intake by case type | Partial / gap | Case type and checklist defaults exist; existence of a fully guided intake state machine is not proven. | Define intake states and case-type-specific required fields/checklists; distinguish draft intake from accepted matter. |
| Conflict-of-interest screening | Implemented on preview branch; verify | New-case intake now routes any detected conflict or uncertain match to a pending review queue rather than creating a matter directly. A manager-only local UI can approve/reject and records decisions. This is not server-side authorization and does not prove true confidentiality in the local-first architecture. | Test exact ID/name matches, former client/opponent, possible similarity, rejection, approval, persistence after reload and audit outcomes. Do not describe the queue as securely isolated until authorization is enforced outside client-controlled UI. |
| Sensitive/uncertain intake approval | Partial / gap | Pending review state and manager UI are present on preview branch; real independent identity/authorization remains unproven. | Verify pending state, reviewer decision, audit and storage. Add server-enforced authorization if confidential review must be protected from local role switching. |
| Responsible lawyer / delegation | Improved on preview branch; verify access effects | Reassignment is manager-only in the local UI, requires a reason, asks for extra confirmation on sensitive/restricted files, and audits old/new responsible lawyer plus reason. Team membership is deliberately not silently changed. | Test role enforcement and audit persistence; decide and verify whether old team members retain access after reassignment. Local UI checks are not server-side authorization. |
| Hearings, deadlines and reminders | Present / verify | Dedicated deadline tests and deadline calculation code exist. | Test representative Algerian procedure scenarios, holidays, judicial vacation, timezone boundaries, overdue items and links back to matter. Legal date rules require owner/professional verification. |
| Tasks and assignments | Present / verify | Task flow and assignment controls exist. | Confirm task ↔ matter ↔ responsible lawyer linkage, completion state, due dates, alerts and permission checks. |
| Documents and generation | Present / verify | Document generator and export/PDF-related functions are described in the README. | Generate sample documents from synthetic matter data; verify correct party/court fields, language, formatting, print/PDF output and no accidental financial/confidential fields. |
| Finance, receipts, expenses and client funds | Present / verify | Finance features are described in the README and present in the app. | Validate calculations, currency/amount formatting, receipt numbering, refunds/corrections and separation of office fees, recoverable expenses and client funds. Do not claim legal/accounting compliance without professional review. |
| Team and permissions | Partial / gap | Roles, role selector, account and permission-related code exist. Local role switching is not proof of independent server-side identities or multi-user isolation. | Test every role against direct navigation and data operations, not only button visibility. Clearly label local demo identities. |
| Audit trail | Partial / gap | Intake log and account/auth log functions exist. Completeness and tamper resistance are not proven. | Record conflict decisions, reassignment, role/permission changes, restore/reset and other sensitive actions with actor/time/outcome. State limitations honestly for client-side storage. |
| Encryption and idle lock | Present / verify | PR #5 covers password verification and event handling; storage encryption logic exists. PR remains unmerged at audit time. | Integrate only on review branch after diff review; test correct/wrong password, lock/unlock, failed verification and real-browser interactions. |
| Migration and backup recovery | Present / verify | PR #6 adds fail-closed recovery and regression tests; latest CI run passed. PR remains draft/open. | Keep recovery markers/backups on failed operations; test upgrade/recovery scenarios and verify restore before cleanup. |
| PWA/offline behavior | Present / verify | Manifest and service worker are explicitly labeled as preview; service worker uses `diwan-preview-professional-20261120`. The preview must still be hosted on a separate origin, because the service worker deletes other cache entries on its own origin. | Change cache namespace for demo-specific assets if needed; test install, refresh/update, offline startup and stale-cache behavior. |
| Synthetic demo data | Partial / implemented on preview branch | Added opt-in reset with a deterministic fictional dataset, explicit confirmation, `DEMO-*` identifiers and an `.invalid` email; resets only the current browser's local records. Follow-up review fixed a guard that could block reset after `clearDemo()` and added a regression assertion. Existing app data remains synthetic per owner statement. | Test reset, reload persistence, all cross-links and calculations; ensure no real-data import occurs. A persistent synthetic-data warning is now shown in the app banner; verify it survives reset/clear and language changes in browser tests. |
| Demo hosting and storage isolation | **Blocker** | Current app is local-storage-first; hosting under a different path on the same origin does not guarantee storage separation. | Prefer a separate origin/host for the demo. Verify service worker scope and localStorage/IndexedDB isolation. Do not deploy until verified. |
| Two reviewers / shared data | Not supported by current evidence | README describes data stored locally on each device with no external server. | Treat reviewers' data as independent per browser. Shared synchronized records require a separate backend/auth/tenant design and are out of scope unless explicitly approved. |
| Accessibility and usability | Not verified | Automated DOM test doubles do not establish full accessibility or usability. | Keyboard navigation, focus management, modal behavior, readable contrast, form validation, RTL/LTR and mobile checks. |
| Automated and browser testing | Partial | Latest PR #6 CI run passed: 289 passed, 0 failed; browser/manual testing was not available for PR #5. | Keep CI green and complete real-browser smoke/end-to-end checks before declaring readiness. |
| Public release / merge | **Blocked pending approval** | Current work is on review branches. | No merge to `main`, no public deployment and no sharing link until the owner approves the release report. |

## Priority order

### P0 — Safety and isolation blockers
1. Make conflict screening a real gate: critical/high findings cannot be bypassed by confirmation.
2. Implement a restricted review state for sensitive or unresolved intake.
3. Ensure responsible-lawyer reassignment is permission-controlled and audited.
4. Add a deterministic synthetic demo dataset and safe reset.
5. Establish a separate origin for the demo and verify no shared browser storage or service-worker collision.

### P1 — Workflow integrity
1. Run end-to-end matter intake and lifecycle tests by case type.
2. Verify matter/party/hearing/deadline/task/document/finance links.
3. Test permission enforcement and audit records for sensitive operations.
4. Verify backup/restore, idle lock and migration recovery against the selected preview branch.

### P2 — Professional presentation
1. Reconcile navigation and guide structure.
2. Polish empty/error/success states, field validation, labels and Arabic/French consistency.
3. Verify responsive layout, print/PDF output and PWA refresh/offline behavior.
4. Provide a short reviewer guide with demo credentials and suggested scenarios (no real client data).

## Release gate

Do not share the demo URL until all P0 items pass, P1 critical workflows pass, browser smoke tests have been performed, CI is green, and the owner has approved the release report. Any known limitation must be disclosed to the reviewers.

## Suggested reviewer scenarios

1. Create a new ordinary civil matter and link its parties.
2. Add a hearing and confirm the deadline/dashboard linkage.
3. Create and complete a task assigned to a demo team member.
4. Generate a document from the matter and inspect PDF/print output.
5. Record a synthetic expense/receipt and verify totals.
6. Trigger an exact conflict and confirm acceptance is blocked.
7. Trigger a possible name similarity and route it for review.
8. Reassign a matter with an authorized account and inspect the audit record.
9. Lock/unlock the app with correct and incorrect passwords.
10. Reset demo data and confirm the seeded starting state returns without affecting another origin.

## Change control

- This audit document is informational and does not itself alter application behavior.
- The preview branch is based on `review/diwan-fix-01f-migration-recovery-20261120`, not `main`.
- All application changes must remain isolated to the preview/review branches.
- No merge to `main` or deployment without explicit owner approval.
