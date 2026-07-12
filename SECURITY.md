# Security policy

## Reporting

Do not open a public issue for a suspected vulnerability. Contact the project owner privately
with the affected route, reproduction steps, impact, and any logs with tokens/passwords removed.
The owner should acknowledge the report, contain active exposure, preserve evidence, patch, and
rotate affected secrets before publishing details.

## Security boundaries

- Invite codes identify an account for group invitations; they never authenticate a user.
- Passwords are one-way Argon2id hashes. Session tokens and invite codes are stored as keyed
  digests. Raw values are only shown when issued.
- Server-side role checks are authoritative. Hiding a control in the UI is not authorization.
- Drizzle parameterizes values, and database constraints remain the final concurrency guard.
- Uploaded avatars are size/type checked, decoded, resized, and re-encoded before storage.
- Sensitive values must not be placed in logs, source files, images, browser storage, or audit
  metadata.

## Incident checklist

1. Disable affected accounts and stop external access if exploitation is active.
2. Preserve sanitized application, Caddy, PostgreSQL, and audit logs.
3. Rotate database, session, and invite-code secrets according to the suspected scope.
4. Rebuild from patched lockfiles and current base images; do not patch a running container.
5. Review admin activity, memberships, profile changes, and check-ins for unauthorized writes.
6. Restore from a verified backup if integrity cannot be established.
7. Tell affected users plainly what happened, what data was involved, and what they must do.

## Supported version

The pilot supports only the current deployed revision. Older deployments should be upgraded or
taken offline; no backported security fixes are promised during the MVP.
