---
name: heavy-equipment-rental
description: Builds and maintains a secure, production-minded Heavy Equipment Rental System. Use when designing, implementing, reviewing, refactoring, testing, or polishing equipment inventory, availability, rental requests, approvals, payments, returns, inspections, maintenance, dashboards, notifications, reporting, or administrative workflows.
---

# Heavy Equipment Rental System

## Mission

Build a reliable rental operations platform, not a generic CRUD dashboard.

Prioritize, in this order:

1. Rental correctness and data integrity.
2. Authorization and security.
3. Clear customer/staff workflows.
4. Accessibility and responsive UX.
5. Maintainable architecture.
6. Performance.
7. Visual polish.

The system must make it obvious what equipment is available, what a rental costs, what stage a rental is in, and what action happens next.

---

## 1. Agent Behavior

### Inspect first

Before changing code:

- Inspect the repository structure and current architecture.
- Identify the actual framework, language, database, authentication, package manager, and deployment setup.
- Find existing implementations of the relevant feature before adding new ones.
- Follow established project conventions when they are sound.
- Reuse existing components, utilities, schemas, services, and validation patterns.

Never replace working infrastructure merely because another stack or pattern is preferable.

### Keep changes focused

- Make the smallest coherent change that fully satisfies the requirement.
- Do not rewrite unrelated files.
- Do not introduce dependencies without a concrete need.
- Do not create duplicate business logic.
- Do not add speculative features to the MVP.

### Preserve behavior

Before finishing, verify that unrelated authentication, routes, database flows, UI patterns, and existing features still work.

### Be factual

Never invent equipment specifications, rates, taxes, policies, legal requirements, customer data, payment-provider behavior, or inventory facts. Use repository requirements or authoritative documentation. For missing critical rules, use explicit configuration/domain rules instead of silently inventing behavior.

Never claim tests/builds/deployments succeeded unless they were actually run.

---

## 2. Product Scope

### Main roles

Use only the roles required by the actual product:

**Customer / Renter**
- Browse equipment.
- View equipment details.
- Check availability.
- Submit rental requests.
- Complete required payment steps.
- Track rental status.
- View rental history.
- Receive important notifications.

**Rental Staff / Officer**
- Review requests.
- Approve/reject requests.
- Schedule release/pickup.
- Record equipment release and return.
- Record inspections.
- Coordinate maintenance.

**Equipment Owner / Manager**
- Manage assigned equipment.
- Manage pricing when permitted.
- View availability/utilization.
- View condition and maintenance history.

**Administrator**
- Manage users/roles.
- Manage categories and equipment.
- Monitor rentals and operations.
- Manage configuration.
- View reports/audit information.

### Core MVP flow

Customer discovers equipment
→ checks availability
→ selects rental period
→ submits request
→ request reviewed
→ approved/rejected
→ payment/deposit step, if applicable
→ equipment released
→ rental active
→ equipment returned
→ inspection
→ rental completed
→ equipment available or sent to maintenance.

Core MVP should normally cover:

- authentication and role access
- equipment inventory
- equipment details/images
- availability
- rental requests
- approval workflow
- rental lifecycle
- payment/deposit recording or supported integration
- return/inspection
- maintenance blocking
- customer/staff dashboards
- basic reports
- important notifications

Enhancements such as recommendations, chat, maps, advanced analytics, automated pricing, or machine telemetry must not displace core correctness.

---

## 3. Domain Model

Typical entities include:

- users
- roles / permissions
- customer_profiles
- equipment_owners
- equipment_categories
- equipment
- equipment_images
- equipment_documents
- rental_requests
- rentals
- rental_items
- payments
- deposits
- inspections
- inspection_items
- maintenance_records
- maintenance_schedules
- notifications
- reviews
- audit_logs

Do not create every entity automatically. Add only what the actual requirements need.

### Equipment

Each physical equipment unit needs a stable unique identifier. Never rely on its display name as identity.

Common fields, where relevant:

- ID / UUID
- asset code
- name
- category
- make/model
- description
- rental-rate configuration
- operational status
- owner/organization
- location
- created/updated timestamps

### Rental status

Use an explicit state model rather than arbitrary strings spread through UI code.

A typical flow is:

`pending → under_review → approved → payment_pending → paid → scheduled → active → return_pending → returned → inspection → completed`

Possible exception states include:

`rejected`, `cancelled`, `payment_failed`, `overdue`, `disputed`

The actual set must match product requirements. Enforce valid transitions server-side.

### Equipment status

A typical lifecycle is:

`available → reserved → on_rent → returned → inspection → available`

Maintenance must be able to block equipment:

`available → maintenance → available`

Possible states include `unavailable`, `inactive`, `damaged`, and `retired` when required.

---

## 4. Availability — Critical

Availability is authoritative domain logic, not a UI feature.

### Never trust the browser

The server/database must re-check availability when a reservation/request is created or approved. A calendar is informational only.

### Overlap detection

For an interval `[start, end)` use:

`existing_start < requested_end AND existing_end > requested_start`

Apply one consistent date/time model across the system.

### Prevent double booking

Protect against concurrency:

1. User A checks availability.
2. User B checks availability.
3. Both see availability.
4. Both attempt to reserve.

The final database write must be protected by the database transaction, constraint, locking, or equivalent concurrency mechanism appropriate to the actual database.

### Consider all blocking conditions

Availability should account for:

- active/approved reservations
- maintenance windows
- manually unavailable periods
- inactive/retired equipment
- business-defined buffer periods, if any

### Time

Use one canonical timezone strategy. Do not silently mix UTC, server-local time, and browser-local time when rental dates are affected.

---

## 5. Pricing and Money

Treat monetary values as financial data.

- Do not use floating-point arithmetic for important financial calculations when fixed-precision/decimal or minor-unit storage is available.
- Centralize pricing calculations.
- Recalculate final totals on the server.
- Never trust a total sent by the browser.
- Store currency explicitly when needed.
- Display a transparent breakdown.

Possible components:

`base rental + extension + delivery/transport + fees + tax - discounts`

Only include components supported by the actual requirements.

---

## 6. Database Engineering

Use migrations and database-enforced integrity where possible.

- Use foreign keys for real relationships.
- Add unique constraints for true business uniqueness.
- Add indexes for common filters, joins, ownership lookups, and status/date queries.
- Use consistent timestamps.
- Choose delete/cascade behavior deliberately.
- Preserve historical rental/payment/inspection/maintenance records when they have operational value.
- Prefer archive/deactivate over destructive deletion where history matters.

Critical relationships commonly include:

`rental → customer`
`rental → equipment`
`payment → rental`
`maintenance → equipment`
`inspection → rental/equipment`

Do not use ad-hoc production database edits when a migration or controlled operation is appropriate.

---

## 7. Authentication & Authorization

Authentication establishes identity. Authorization establishes permission. Both are required.

### Server-side authorization

Never rely only on:

- hidden buttons
- disabled controls
- client-side role checks
- obscure URLs

The server/data layer must enforce permissions.

### Object-level access

Protect every resource against IDOR/BOLA.

For example, `/rentals/123` must verify that the current user is allowed to access rental `123`.

Knowing an ID does not grant access.

### Ownership boundaries

Users must only access equipment, rentals, payments, documents, reports, and other data that their role and organization/ownership relationship permits.

### High-risk actions

Apply strong authorization checks to:

- rental approval/rejection
- payment state changes
- rental-rate changes
- role changes
- equipment archive/deletion
- inspection completion
- damage/late fees
- maintenance-state changes
- system configuration changes

Record important administrative actions in an audit log when appropriate.

---

## 8. Security

For every feature, consider:

- broken access control
- IDOR/BOLA
- SQL injection
- XSS
- CSRF where applicable
- SSRF where applicable
- insecure file upload
- path traversal
- command injection
- mass assignment
- unsafe deserialization
- credential leakage
- session/authentication flaws
- rate-limit abuse
- replay/double submission
- race conditions
- sensitive-data exposure

### Validation

Validate untrusted input at the server boundary:

- required fields
- type
- length
- enums
- numeric ranges
- date ordering
- file size/type
- ownership/authorization

Client-side validation improves UX but is not a security boundary.

### Secrets

Never put secrets, database credentials, private signing keys, privileged service keys, or other sensitive credentials in client code, committed source, screenshots, logs, or public environment variables.

### File uploads

For images/documents:

- authenticate the upload action
- validate type and size
- generate safe server-side filenames/keys
- control storage access
- prevent executable content
- avoid predictable public URLs for private documents
- use scanning where the deployment supports/requires it

Never use an untrusted filename directly as a filesystem path.

---

## 9. API / Server Architecture

Keep important business rules out of UI components.

Use a service/domain layer or the equivalent pattern in the chosen stack for logic such as:

- availability
- pricing
- rental transitions
- inspections
- maintenance
- notifications

Keep handlers/controllers/routes focused on request parsing, authorization, orchestration, and response formatting.

### Errors

Return useful, predictable errors without exposing:

- stack traces
- SQL errors
- secrets
- internal paths
- unnecessary implementation details

Log securely on the server while giving users actionable messages.

### Idempotency

Consider idempotency for retryable operations, especially:

- rental creation
- payment confirmation
- approval actions
- webhooks
- notifications

A repeated request must not accidentally duplicate a rental, charge, or state transition.

---

## 10. UI/UX System

The UI should feel like a professional equipment-rental operation, not a generic admin template.

### UX hierarchy

Users should quickly understand:

1. What equipment is this?
2. Is it available?
3. What does it cost?
4. When can I rent it?
5. What information is required?
6. What happens after I request it?
7. What is the current status?
8. What should I do next?

### Visual direction

Use a clean, modern, industrial aesthetic:

- strong typography hierarchy
- restrained palette
- generous spacing
- clear cards/tables
- high-quality equipment imagery
- consistent iconography
- subtle borders/shadows
- responsive layout
- minimal, purposeful motion

Avoid excessive gradients, decorative effects, oversized UI, and animation that competes with operational information.

### Color semantics

Keep status meaning consistent. Example:

- success: available/completed/approved
- warning: pending/attention
- destructive: rejected/cancelled/error
- neutral: inactive/archived

Never communicate important status using color alone.

### Responsive behavior

Design deliberately for mobile, tablet, and desktop. Do not solve mobile tables by blindly allowing horizontal overflow when a better responsive representation is possible.

### Accessibility

Preserve practical WCAG-aligned behavior:

- semantic HTML
- keyboard navigation
- visible focus
- associated labels
- accessible dialogs
- sufficient contrast
- meaningful errors
- non-color status cues
- appropriate image alt text

---

## 11. Equipment Discovery UX

Equipment listings should support real decisions.

Useful filters may include:

- equipment type/category
- availability
- rental rate
- manufacturer
- relevant capacity/specification
- location, if applicable

Do not add filters with no meaningful use case.

Equipment cards should prioritize:

- image
- name
- type/category
- availability
- rental rate
- primary action

Keep technical specifications on the detail page instead of cramming everything into cards.

### Equipment detail page

Recommended hierarchy:

1. Equipment identity and hero image.
2. Availability.
3. Pricing.
4. Important specifications.
5. Relevant rental terms.
6. Date/duration selection.
7. Primary rental-request CTA.
8. Documents/additional information.
9. Alternatives/related equipment only when useful.

---

## 12. Rental Request UX

The request process should distinguish clearly between:

`request submitted` and `rental confirmed`

A request form should clearly show:

- selected equipment
- rental period
- price breakdown
- required customer information
- required documents
- pickup/delivery information, if applicable
- final confirmation

Before submission, show what the user is actually committing to and what happens next.

### Async actions

For slow actions:

- disable duplicate submission
- show an immediate loading/progress state
- preserve entered values where possible
- show clear success/failure feedback

---

## 13. Status, Tables, and Dashboards

Use precise status labels.

Prefer `Request under review` over vague labels such as `Processing`.

### Empty states

An empty state should explain what is missing and provide a useful next action where applicable.

Avoid repeating `No data found` everywhere.

### Operational tables

Prioritize:

- identifier
- customer/equipment
- rental dates
- status
- amount, when relevant
- next action

Use server-side pagination for large datasets. Avoid loading thousands of rows into the browser just to display a small page.

### Metrics

Every dashboard metric must have a clear definition.

For example, `Active Rentals` should correspond to the system's defined active rental states, not an arbitrary count.

---

## 14. Notifications

Notify users for meaningful events such as:

- request submitted
- request approved/rejected
- payment received/failed
- pickup approaching
- rental due soon
- overdue rental
- return recorded
- inspection completed
- equipment blocked by maintenance

Avoid notification spam.

---

## 15. Search

Search should match the domain and improve discoverability without creating dangerous ambiguity.

Use normalized matching where appropriate. Fuzzy matching can be useful for common misspellings, but do not return unrelated equipment merely because a similarity algorithm produced a match.

---

## 16. Testing

### Unit tests

Prioritize:

- interval overlap logic
- availability rules
- pricing calculations
- status transition rules
- validation
- permission logic

### Integration tests

Prioritize:

- rental creation
- approval flow
- concurrent booking protection
- maintenance blocking
- payment state handling
- cross-user access rejection
- file upload restrictions

### End-to-end tests

At minimum cover the main flow:

Customer login
→ equipment search
→ available equipment
→ rental request
→ staff approval
→ updated customer status
→ active rental
→ return/inspection
→ completed rental

Also test rejection, failure, unauthorized access, and duplicate submission paths.

### Security tests

Attempt:

- unauthorized routes
- cross-user rental access
- cross-organization access
- role escalation
- malformed input
- mass assignment
- duplicate requests
- malicious uploads
- race conditions on availability

---

## 17. Auditability, Privacy & Observability

Important operational actions should be traceable, especially:

- rental approval/rejection
- payment changes
- equipment status changes
- maintenance updates
- inspection results
- role changes
- destructive/archival admin actions

Do not log secrets or unnecessary personal data.

Separate public equipment information from private customer data, sensitive documents, and financial information.

Private customer documents must be protected by authorization rather than predictable public URLs.

---

## 18. Performance

Optimize based on evidence.

Prioritize:

- indexed queries
- server-side pagination
- efficient relationships/joins
- optimized images
- lazy loading for non-critical content
- avoiding N+1 queries
- sensible API payloads

Do not introduce complicated caching that makes rental correctness harder to reason about unless there is a demonstrated need.

---

## 19. Environment & Deployment

Keep development, test/staging, and production separated where possible.

Do not run destructive rental/payment/database tests against production data when a safe environment exists.

Before deployment:

- run tests
- verify migrations
- verify environment variables
- verify authentication configuration
- build the application
- check database connectivity
- exercise critical rental workflows

---

## 20. Code Quality

Prefer:

- explicit types
- descriptive names
- small focused functions
- reusable validation
- centralized domain rules
- predictable errors
- clear component boundaries
- minimal comments focused on intent

Avoid:

- giant components
- duplicated business rules
- magic values
- hidden side effects
- unnecessary global state
- untyped escape hatches when proper types are practical
- disabling lint/type checks to hide defects

### UI component discipline

Before creating a new component:

1. Search for an existing equivalent.
2. Reuse it when appropriate.
3. Extend it when the variation is genuinely reusable.
4. Create a new component only when its responsibility is meaningfully different.

---

## 21. Special Rental Rules

Unless explicit requirements override them:

1. The browser is never the source of truth for availability.
2. The browser is never the source of truth for final rental totals.
3. The browser is never the source of truth for authorization.
4. Critical rental status transitions are server-controlled.
5. Maintenance blocks must affect availability.
6. Duplicate submissions must not duplicate operational records.
7. Important administrative actions should be auditable.
8. Historical rental/payment/inspection records must not be casually deleted.
9. Sensitive documents must not be publicly exposed.
10. Important rental conditions and statuses must be visible to the user.

---

## 22. Handling Ambiguous Requirements

Do not silently invent critical business rules.

Critical examples:

- who may approve a rental
- deposit requirements
- cancellation policy
- late fees
- damage fees
- taxes
- delivery responsibility
- ownership boundaries

For missing rules, choose the simplest configurable domain behavior and document the assumption.

For non-critical UI details, use the existing design system and repository conventions.

---

## 23. Definition of Done

A feature is done only when:

- the intended workflow works
- validation works
- unauthorized access is blocked
- important error states are understandable
- async actions prevent duplicates
- responsive behavior is acceptable
- accessibility basics are preserved
- database integrity is preserved
- relevant tests pass
- no secrets/sensitive data were introduced
- unrelated functionality was not unnecessarily changed
- UI follows existing product patterns
- rental availability/concurrency implications were checked

---

## 24. Implementation Workflow

When asked to implement a feature:

1. Inspect the repository and relevant existing code.
2. Identify user role, goal, entities, permissions, states, validation, and risks.
3. Define the smallest complete implementation.
4. Implement domain/data rules.
5. Implement server/API behavior.
6. Implement UI and async/error states.
7. Add tests for important business and security paths.
8. Run project validation/build/tests.
9. Review the diff for unrelated changes.
10. Report what changed, what was verified, and any remaining risks.

Never optimize for “it looks finished” while leaving correctness, authorization, or data integrity unresolved.
