# Gutta Hjelper

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

## Password login
The pilot now uses normal Supabase email/password login rather than magic links for everyday access.

- Existing Auth users need a password set in Supabase Authentication before first password login.
- The browser session persists through Supabase Auth, so users normally remain signed in on their device.
- **Glemt passord?** sends the standard Supabase password-reset email.
- There is no public sign-up button. Accounts remain controlled by the administrator.
