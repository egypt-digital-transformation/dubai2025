# Ahlan Companion App
## Current-State Assessment

**Existing capabilities, gaps and agency alignment priorities**  
**Event:** Holcim AMEA Management Meeting — Egypt (proposed)  
**Prepared:** 13 October 2026  
**Purpose:** Provide the agency with an evidence-based view of what the current repository appears to contain, what is only partly implemented, and what should be scoped for the Egypt event.

> **Overall assessment:** The repository provides a reusable Ionic/Angular and Firebase foundation, including Google sign-in, agenda screens, basic announcements, a PWA shell and some networking UI. It is not yet the proposed Egypt VIP concierge product: travel and hotel services, the mandatory site-access workflow, Egypt-specific content, full event administration and personalized post-event services require implementation or confirmation.

## Status key

- **In place:** Relevant functionality is present in reviewed source; this does not certify production operation.
- **Partial / prototype:** Some UI or technical foundation exists, but the proposed end-to-end feature is incomplete, static, sample-based or unverified.
- **Not found:** No implementation for the stated proposal feature was identified in the reviewed repository.
- **Verify externally:** Repository evidence cannot confirm live Firebase configuration, deployment, ownership, data quality or operational readiness.

## 1. Capability assessment

| Workstream | Status | Repository evidence / qualification |
|---|---|---|
| Authentication and access | **Partial / prototype** | Google sign-in and authenticated routes are present. No attendee allowlist or corporate-domain/verified-delegate gate was identified. |
| Personal welcome and travel concierge | **Not found** | A dashboard exists, but no flight records, arrival status, airport meet-and-greet, hotel reservation or room assignment workflow was found. |
| HSE onboarding and site-access gate | **Partial / prototype** | A local video-based induction screen exists. Completion is stored in browser localStorage; separate Sokhna/RMX portals, server-side completion evidence and badge/Track A gating were not found. |
| Venue and site wayfinding | **Partial / prototype** | A generic hotel floor-plan screen is present. It is illustrative, with placeholder interactions; plant/GEM maps and live directional markers were not found. |
| Agenda and track personalization | **Partial / prototype** | Firestore-backed agenda and some group/track filtering exist. Egypt Track A/Track B rules and personal calendar sync are not established as a complete workflow. |
| Plenary engagement | **Not found** | No live polling, quiz, plenary Q&A-to-screen workflow or six-booth rotational expo guide was identified. |
| Networking and digital business card | **Partial / prototype** | A social feed exists. The business-card screen uses a static QR image and fixed profile data, rather than a delegate-specific exchange flow. |
| Resource and content hub | **Partial / prototype** | A resources screen exists, but sample download links use example.com and current guide content is Egypt/UAE-oriented. |
| Iconic projects showcase | **Not found** | No interactive Egypt/AMEA landmark gallery, 3D project experience or project-level carbon/concrete data overlays were identified. |
| Cultural excursion guide | **Not found** | No Egypt-specific GEM, Giza, VIP access/routing or extended-stay guide was identified. |
| Emergency and concierge support | **Partial / prototype** | Existing tips content includes UAE-specific contact information. Egypt contacts and an in-app concierge/SOS escalation process were not found. |
| Notifications | **In place (deployment unverified)** | Source now includes Firebase Cloud Messaging (FCM) token registration, agenda reminders, immediate and Egypt-time scheduled admin pushes, quiz/poll alerts, and attendee/admin request alerts. Scheduled delivery requires the Cloud Functions and Firestore index changes to be deployed; active admins and attendees also need registered push tokens. |
| Admin operations and imports | **Partial / prototype** | A limited admin-only announcement function exists. No central operations dashboard, analytics, agenda editor, CSV upload or Google Sheets sync interface was found. |
| Personalized post-event recap | **Not found** | No AI-generated attendance/takeaway recap, tagged-photo delivery or personalized carbon-offset certificate was identified. |
| Onboarding video | **Not found** | No 60-second app onboarding video or embedded login-screen walkthrough was identified. |
| PWA and offline support | **Partial / prototype** | PWA install support, manifest and Angular service-worker configuration are present. Offline coverage and resynchronization for proposed maps/delegate data require validation. |
| Firebase deployment and handover | **Verify externally** | Firebase client services and Hosting/Functions configuration are present in source. Repository configuration does not prove deployment to the approved corporate project or completed handover. |
| QA and device guides | **Not found** | No cross-device QA sign-off or finished iOS/Android installation guide was identified in reviewed sources. |

## 2. Existing foundations that may be reusable

- Ionic/Angular application structure, routing and mobile-responsive UI patterns.
- Firebase Authentication, Firestore, Storage integration and Firebase Hosting/Cloud Functions configuration.
- Agenda and announcement data views, with limited group-based schedule personalization.
- PWA manifest, install prompts and Angular service-worker configuration.
- Firebase Cloud Messaging (FCM) push foundation for agenda reminders, admin campaigns, quiz/poll alerts, and request status updates; live delivery still depends on Firebase deployment, valid configuration, permissions and registered device tokens.
- Basic networking feed with posts, comments and likes; selected UI components for resources, venue and HSE.

## 3. Readiness items to resolve before development or launch

- **Firestore rules:** The rules in the repository contain an expiry date of **19 September 2026**. Confirm the currently deployed rules and replace/approve them before any live use; the source file alone cannot establish the live state.
- **Prototype/sample content:** The reviewed content contains example.com resource links, static QR/profile details, a local HSE video and Egypt/UAE guidance. Replace and validate all event content for Egypt.
- **Environment and ownership:** Confirm the corporate Firebase project, agency access model, environments, data ownership, backup/retention, security review and deployment responsibilities.
- **Push deployment:** Deploy the updated Cloud Functions and Firestore index, verify the web-push VAPID key in the approved Firebase project, and confirm that attendee and active-admin devices have registered push tokens.
- **Delegate data:** Define how delegate, flight, hotel, attendance and group data will be provided, validated, updated and removed (Sheets integration versus controlled CSV upload).
- **Privacy and consent:** Agree privacy, consent, retention and access controls for attendee contact data, analytics, photos, facial recognition, AI-generated recaps and carbon-offset attribution.
- **Approved content:** Confirm the source and owners of brand assets, maps, project facts, media, HSE portals, support contacts and content approvals.

## 4. Suggested agency scoping structure

This phasing is a scoping suggestion, not a change to the requested proposal. The agency should confirm priorities, dependencies and whether all features are required for the initial event release.

### Phase 1 — Event-critical companion

Secure verified-delegate access; personalized profile/travel/hotel data; HSE completion and track/badge gate; three-day agenda and group filtering; Egypt venue/site information; support contacts; admin data import/editing; essential push alerts; offline-critical content; security and cross-device QA.

### Phase 2 — Engagement and content

Polling, Q&A, quizzes, rotational expo guide, personalized digital business card, resource library, project gallery and curated cultural guide.

### Phase 3 — Advanced personalization

Post-event recap automation, photo association, carbon certificate, expanded analytics and any AI/3D experience, subject to feasibility, consent, data governance and approved source material.

## 5. Items for agency response

1. Please validate each status against the current deployed application and Firebase environment, and identify any work already completed outside this repository.
2. Provide a feature-by-feature delivery estimate, timeline, assumptions, exclusions, dependencies and named client/agency responsibilities.
3. Explain the proposed secure attendee authentication and HSE completion/access-control design, including offline behavior and auditability.
4. Confirm recommended integration patterns for Google Sheets/CSV, travel/hotel data, push notifications, calendar sync and the external HSE portals.
5. Identify privacy/security/legal approvals and feasibility constraints for facial recognition, AI recaps, delegate analytics and contact-card exchange.
6. Specify acceptance tests and sign-off evidence for functionality, access control, data accuracy, accessibility, offline use, iOS/Android PWA installation and production deployment.

## Review basis and limitations

This assessment is based on source files in the application repository, including Angular/Ionic screens and services, Firebase configuration, Firestore rules, Cloud Functions and sample content. It is a code-level review only. No production app, Firebase Console, administrator workflow, live user dataset or agency delivery materials were inspected.

“Not found” means not identified in the reviewed repository; it does not rule out separately deployed or undocumented functionality. Confirm all items with the current app owner and agency before using this as a contractual scope baseline.
