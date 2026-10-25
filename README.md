# Gutta Hjelper Arbeid V6

A simplified, single-business mobile web app.

## Roles
- **Admin:** creates jobs, changes job status, sees prices/overview, adds/deactivates workers.
- **Worker:** selects an active job and registers hours, equipment, transport, notes, expenses, receipts and before/after photos.

## Adding another worker
1. Create or invite the email account in Supabase Authentication.
2. Sign in as an app admin.
3. Open **Arbeidere**, enter the same email and select **Bruker**.
4. The `add_app_user` RPC activates the account in the app.

This design deliberately does not expose the Supabase service-role key to the browser. Creating the Auth account remains an administrator action in Supabase Dashboard. The in-app admin manages access after the Auth account exists.

## Setup
1. Create a new Supabase development project.
2. Run `supabase-schema.sql` once.
3. Create the first admin in Supabase Authentication.
4. Insert the first row in `app_users` using the bootstrap example at the bottom of the SQL file.
5. Replace `{{SUPABASE_URL}}`, `{{SUPABASE_ANON_KEY}}` and `{{BUSINESS_ID}}` in `cloud-config.js`. `BUSINESS_ID` is retained for compatibility but is not used by the V6 single-business schema.
6. Configure the deployed URL in Supabase Authentication URL settings.
7. Deploy over HTTPS.

Official invoices, payroll, tax and VAT reporting stay in the chosen Norwegian accounting system.

## Worker invitations and access management

V6 now includes the server-side Edge Function `supabase/functions/invite-worker/`.

### Invite a worker
1. Sign in as an app admin.
2. Open **Arbeidere**.
3. Enter the person's display name and email.
4. Select **Bruker** for a normal worker. Select **Admin** only when the person should manage jobs and users.
5. Press **Legg til bruker**. The Edge Function verifies the caller is an active admin, sends the Supabase invite email, and creates the `app_users` record.
6. The invited person follows the email link and can then log in to the app.

### Deactivate access
Use **Deaktiver** in **Arbeidere**. This immediately removes app access through `current_role()` because inactive users no longer satisfy the RLS role check. It does not delete historical work records.

### Reactivate access
Use **Aktiver**. The user keeps the existing Auth account and historical records.

### Removing someone permanently
Prefer deactivation for former helpers so their historical hours, expenses, and photos remain attributable. Delete the Auth user only when legally/operationally appropriate and after checking record retention requirements.

### Admin access
Keep the admin group very small. A normal helper should always use **Bruker**. Admins can create jobs, see pricing, manage users, and see business overview data.

### Supabase settings
- Treat the application as invite-only.
- Configure the production app URL in Authentication URL Configuration.
- Deploy `invite-worker` and keep the service-role key only in Supabase server-side secrets. Never place it in `cloud-config.js` or browser JavaScript.
