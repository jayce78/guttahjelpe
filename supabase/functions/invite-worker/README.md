# invite-worker Edge Function

Invites a worker/admin through the Supabase Admin Auth API and creates/updates the corresponding `app_users` membership.

The function verifies that the caller is an active app admin before using the service-role client.

Deploy:

```bash
supabase functions deploy invite-worker
```

Set the app's deployed URL under Supabase Authentication URL Configuration so invite links return to the app.
