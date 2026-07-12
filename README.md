# Streak Club

An invite-only, mobile-first habit competition for small friend groups. The MVP favors
consistent check-ins over raw habit volume: everyone can earn the same 100 daily points
whether their group tracks one habit or three.

## MVP capabilities

- Admin-provisioned accounts with forced password change and Argon2id password hashing
- Unique usernames with availability suggestions and rotatable private invite codes
- Member profiles, emoji identities, privacy settings, and safely re-encoded avatars
- Two owned groups per free user, four total members, and three active habits per group
- Request/accept/decline invitations requiring both username and invite code
- One self check-in per habit per local day, undo support, and seven-day fair standings
- Unlimited groups and membership capacity for super admins
- Audit events, login backoff, database-backed rate limits, secure sessions, and strict CSP
- PostgreSQL, automatic migrations, Docker health checks, and Caddy-managed HTTPS

Subscriptions and email delivery are deliberately deferred.

## Local development

Requirements: Node.js 24+, npm, PostgreSQL 17+, and optionally Docker.

1. Copy `.env.example` to `.env.local` and replace every example secret. Do not reuse
   secrets between fields.
2. Create the database and run:

   ```sh
   npm ci
   npm run db:migrate
   npm run admin:bootstrap
   npm run dev
   ```

3. Open `http://localhost:3000`. The bootstrap account must change its temporary password
   on first login.

For the complete local Docker stack without HTTPS/Caddy:

```sh
docker compose -f compose.yaml -f compose.local.yaml up --build -d db migrate app
```

Open `http://localhost:3001`. The local override uses port 3001 to avoid common port-3000
conflicts.

Generate secrets with a cryptographically secure generator, for example:

```sh
openssl rand -base64 48
```

The optional demo dataset is blocked in production:

```sh
SEED_PASSWORD='a-strong-temporary-password' npm run seed
```

## Production deployment

1. Point a domain at the VPS and allow inbound TCP 80/443 and UDP 443.
2. Install Docker Engine with the Compose plugin.
3. Create `secrets/` outside source control, write independent random values to
   `db_password.txt`, `session_secret.txt`, and `invite_code_secret.txt`, then run
   `chmod 700 secrets && chmod 600 secrets/*.txt`.
4. Set the public hostname without a scheme: `export DOMAIN=club.example.com`.
5. Run `docker compose up --build -d`. The migration job must finish before the app starts.
6. Bootstrap the first admin once:

   ```sh
   docker compose run --rm \
     -e BOOTSTRAP_USERNAME=clubadmin \
     -e BOOTSTRAP_DISPLAY_NAME='Club Admin' \
     -e BOOTSTRAP_PASSWORD \
     migrate npm run admin:bootstrap
   ```

   Export `BOOTSTRAP_PASSWORD` from a protected shell or secret manager first, then unset it.

The app container runs as an unprivileged user with a read-only root filesystem. PostgreSQL
and avatars use named volumes. Caddy provisions and renews TLS certificates.

Docker Compose secret files are protected from the repository and containers that do not
need them, but they are not a substitute for encrypted host storage. Use encrypted VPS disks
and, for a serious launch, inject secrets from the hosting provider’s vault or decrypt
SOPS/age-managed files only during deployment.

## Backups and restore

Create an encrypted, timestamped database backup and separately copy the avatar volume.
Never leave raw dumps in web-accessible or unencrypted storage.

```sh
docker compose exec -T db pg_dump -U streak -d streak_club -Fc > streak-club.dump
age -r YOUR_AGE_RECIPIENT streak-club.dump
rm streak-club.dump
```

Restore into an empty maintenance database after stopping app writes:

```sh
age -d streak-club.dump.age > streak-club.dump
docker compose exec -T db pg_restore -U streak -d streak_club --clean --if-exists < streak-club.dump
rm streak-club.dump
```

Test restores on a non-production host. A backup that has never been restored is unverified.

## Verification

```sh
npm run check
npm run security:deps
docker build --target runner --tag streak-club:scan .
npm run security:container
```

The container scan command requires the current Trivy CLI. Pin and verify the scanner installation
through your deployment environment rather than downloading an unverified binary in a package
script.

The pure business/security logic test suite covers password handling, token digests, username
rules, group policy limits, fair scoring, and streak calculation. Database constraints enforce
membership, invitation, username, and daily check-in uniqueness even under concurrent requests.
`npm run test:integration` exercises those constraints when `TEST_DATABASE_URL` points to a
migrated disposable database; CI provisions one automatically.

`npm run test:e2e` runs the real browser journey against `E2E_BASE_URL`. It requires the
Playwright Chromium runtime plus `E2E_ADMIN_TEMP_PASSWORD` and `E2E_ADMIN_FINAL_PASSWORD`.

## Security operations

- Patch dependencies and base images promptly; do not deploy when `npm audit` reports a known
  vulnerability without documenting and reviewing the exact exposure.
- Rotate session and invite-code secrets after a suspected leak. Rotating them invalidates
  current sessions or invite codes respectively.
- Review audit logs after repeated login failures, unexpected admin actions, or account changes.
- Disable a compromised account from the admin screen; this deletes all active sessions.
- Keep PostgreSQL private to the Compose network. Only Caddy exposes host ports.
- Profile data is intentionally minimal. Do not add date of birth, address, or health data to
  this MVP.

See [SECURITY.md](SECURITY.md) for reporting and response guidance.
This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
