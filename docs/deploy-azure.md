# Deploying to Azure

Target: **Azure Container Apps**, with **Azure Database for PostgreSQL Flexible
Server** and an **Azure Files** share for uploads.

Why Container Apps rather than App Service or AKS: the app is one container
with one replica for a single-tenant pilot. Container Apps gives managed TLS, a
container registry integration, secrets, and jobs — which is what the migration
and operational commands need — without the cluster that AKS would make you
own. App Service for Containers would also work; it has no first-class job
primitive, so migrations and `policies:*` would need another home.

## What you need first

- `az` CLI, logged in (`az login`) against the subscription you want billed
- Docker running locally (the images are built on your machine and pushed)
- An Anthropic API key

## One-time

```bash
cp deploy/azure/env.example deploy/azure/.env
# edit deploy/azure/.env — at minimum ACR_NAME, STORAGE_ACCOUNT (both must be
# globally unique), AUTH_SECRET and ANTHROPIC_API_KEY
openssl rand -base64 32        # for AUTH_SECRET

./deploy/azure/provision.sh
```

`provision.sh` creates the resource group, registry, Postgres server, storage
account and file share, and the Container Apps environment. It is safe to
re-run. It writes `deploy/azure/.provisioned` (mode 600) holding the generated
Postgres password and the assembled `DATABASE_URL` — **that file is the only
copy of the database password**, and it is gitignored.

## Every deploy

```bash
./deploy/azure/deploy.sh
```

It builds both images for `linux/amd64`, pushes them, **runs migrations as a
job and waits for it to succeed**, and only then rolls the app revision. If the
migration fails it prints the logs and stops without touching the running app.

That ordering is deliberate. This repo has already had one production outage
from the schema being behind the code: a re-index ran against a database
missing a column, deleted every policy chunk, could not write the replacements,
and retrieval silently returned nothing while the app looked healthy.

## Creating the first admin, and other operational commands

The app image is deliberately lean — 94MB, standalone Next.js output, no Prisma
CLI and no `scripts/`. The migrator image carries `src/` and `scripts/` and
doubles as the ops image:

```bash
./deploy/azure/ops.sh user:create -- --email you@example.org --name 'You' --role admin
./deploy/azure/ops.sh policies:coverage
./deploy/azure/ops.sh policies:load -- --file /tmp/JICK.pdf --title '...' --jurisdiction district --category bullying --effective 2026-07-01 --apply
./deploy/azure/ops.sh policies:reindex            # dry run
./deploy/azure/ops.sh policies:reindex -- --apply
```

`user:create` prints a generated password once. Store it immediately.

These run against the real database. `policies:reindex` without `--apply` is a
dry run, and that is how to start — see `CLAUDE.md` on why.

## Things that will bite you if you change them

**The uploads mount is not optional.** `/app/uploads` holds attachments —
student records — and the policy source files `policies:reindex` re-extracts
from. Container filesystems are ephemeral: without the Azure Files volume in
`containerapp.template.yaml`, every attachment an administrator uploads is
destroyed on the next deploy, restart or scale event, and the app will report
no error at any point. The mount is the only thing making that storage real.

**`NEXTAUTH_URL` must be the `https://` URL.** The ingress terminates TLS and
forwards plain http, so the app cannot tell it was an https request. That value
is what decides whether the session cookie is issued `Secure` and with the
`__Secure-` prefix (`shouldUseSecureCookies` in `src/auth.config.ts`). Set it to
http, or leave it unset, and you issue an unprotected session cookie for an
application holding Title IX files about minors — and nothing in the app will
tell you. `deploy.sh` sets it from the app's own FQDN, which is why the first
run applies the config twice.

**One replica, deliberately.** `minReplicas: 1` and `maxReplicas: 1`.
Scale-to-zero would make an administrator wait through a cold start in the
middle of an incident. More than one replica needs two things that have not
been established: that concurrent writes to the Azure Files share are safe, and
that migrations are not racing (they are not — they run as a job — but
`RUN_MIGRATIONS`-style startup migrations would). Raise it with evidence, not
by default.

**Postgres is reachable from Azure services only.** `provision.sh` uses
`--public-access 0.0.0.0`, which despite the notation means "Azure services",
not the internet. To connect `psql` from your own machine, add your address
explicitly:

```bash
az postgres flexible-server firewall-rule create -g rg-generalschat \
  -n pg-generalschat --rule-name me --start-ip-address <your-ip> --end-ip-address <your-ip>
```

**`sslmode=require` is in the connection string** and Azure Postgres will
refuse the connection without it.

## Costs, roughly

Burstable `Standard_B1ms` Postgres, one 1-vCPU Container App replica held at
minimum 1, a Basic registry and a 64GB file share. This is the small end of
each; the always-on replica is the largest line. Scale-to-zero would cut it and
costs an administrator a cold start mid-incident — a deliberate trade, not an
oversight.

## What this does not set up

- **A custom domain and certificate.** Container Apps gives you an
  `azurecontainerapps.io` hostname with TLS. A district domain needs
  `az containerapp hostname add` plus a managed certificate, and
  `NEXTAUTH_URL` updated to match — the cookie depends on it.
- **Backups beyond the Postgres default.** Flexible Server takes automatic
  backups with a 7-day retention by default. The Azure Files share holding
  student records has **no backup configured**. Decide that before the pilot
  holds anything real.
- **Log retention and alerting.** Container Apps sends stdout to Log Analytics
  in the environment; nothing alerts on anything.
- **Rate limiting.** Still open from the audit (SEC-11/SEC-23). The credentials
  endpoint is public and unthrottled, and `bcrypt` at cost 12 blocks the event
  loop for ~0.25s per attempt. Worth closing before this is reachable from the
  open internet by anyone who knows the hostname.
