# Admin panel setup

## Granting admin access

Create a document in the production Firestore `admins` collection for each administrator:

- Document ID: the administrator's Firebase Authentication email address, in
  lowercase (for example, `hadeer.hamada@holcim.com`).
- Fields: `active: true` and `email` with the same address.

The client checks that a signed-in account's Firebase Authentication email matches
the document ID before showing the Admin Panel card and allowing the route. The
application does not grant or revoke admin access; use the Firebase Console or
trusted Admin SDK tooling. Set `active` to `false` to disable an administrator.

Admin callable Functions require sign-in but do not verify the admin document.
Their endpoints can therefore be called by any authenticated user who knows the
function name; the client-side check only controls the app's own navigation and is
not backend authorization.

Deploy the Firestore rules and the `europe-west1` Cloud Functions with the app.
The rules permit an authenticated user to read only the admin document matching
their Firebase Authentication email.
Administrator announcements, dashboard data, push-token registration, notification
sends, and notification-open reporting use callable Cloud Functions.
Set the production Firebase Web Push certificate's VAPID key in
`src/environments/environment.prod.ts`; the current checked-in value is empty, so
web push token registration will not be available until it is configured.

Admins can also publish one-question, multiple-choice quizzes and polls to the same
all-attendee, individual-attendee, or profile-segment audiences. Attendees open
Quizzes & Polls from Home and can submit one response per activity. Quiz answer
keys are kept server-side; aggregate response counts are displayed in the admin UI.

## Cloud Functions source layout

`functions/index.js` remains the deployment entry point and re-exports the functions.
Implementation modules are grouped by responsibility: `functions/engagement/`
handles activity and token registration, `functions/admin/` handles announcements
and analytics, `functions/notifications/` handles campaigns and opens, and
`functions/reminders/` handles scheduled and manual agenda reminders. Shared
Firebase, admin authorization, and notification helpers are under
`functions/shared/`.

## Dashboard measurements

- **Logged in:** unique authenticated accounts first observed by the app after
  `recordAppActivity` is deployed.
- **Active:** accounts whose last activity heartbeat was received in the previous
  15 minutes. Authenticated clients report activity on startup and every five
  minutes; the dashboard refreshes every 30 seconds.
- **Added to home screen:** accounts for which the browser reports an install event
  or the app is opened in standalone mode. Browsers do not expose a reliable,
  universal install signal, so this is an observed account count, not a certified
  count of every device installation.
- **Push accepted/failed:** Firebase Cloud Messaging's per-token send response.
  Accepted means Firebase accepted the send request; it is not proof that the
  device displayed the notification.
- **Opened:** unique recipients who return to the authenticated app through a
  campaign notification. The app records opens once per recipient and campaign.
  This is not a general-purpose operating-system notification impression metric.

Historical activity and installation counts start when the corresponding app
instrumentation and functions are deployed; earlier use cannot be reconstructed.

## Attendee data used for targeting

The panel reads delegate profiles from `users`. A profile must include `email`;
push delivery requires an `fcmToken`, registered by the signed-in account. Group
segments use the existing agenda fields `day2.group`, `day3.type`, `day3.groupAM`,
and `day3.groupPM`. The admin panel shows whichever non-empty values are present
in the current profiles. Confirm that the deployed attendee import uses these
field names before sending a group-targeted campaign.

Campaign delivery records contain hashed recipient email identifiers rather than
email addresses. Dashboard attendee email lists are returned only after the
server verifies admin access.
