import { createClient } from 'npm:@supabase/supabase-js@2.80.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Ikke innlogget.' }, 401)

    const url = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } })
    const adminClient = createClient(url, serviceRole, { auth: { persistSession: false } })

    const { data: userData, error: userErr } = await userClient.auth.getUser()
    if (userErr || !userData.user) return json({ error: 'Ugyldig innlogging.' }, 401)

    const { data: caller, error: callerErr } = await adminClient.from('app_users').select('role,active').eq('user_id', userData.user.id).maybeSingle()
    if (callerErr || !caller?.active || caller.role !== 'admin') return json({ error: 'Bare administrator kan invitere brukere.' }, 403)

    const body = await req.json()
    const email = String(body.email || '').trim().toLowerCase()
    const role = body.role === 'admin' ? 'admin' : 'worker'
    const displayName = String(body.display_name || '').trim() || null
    const redirectTo = String(body.redirect_to || '').trim() || undefined
    if (!email || !email.includes('@')) return json({ error: 'Ugyldig e-postadresse.' }, 400)

    const { data: invite, error: inviteErr } = await adminClient.auth.admin.inviteUserByEmail(email, { redirectTo, data: { display_name: displayName } })
    if (inviteErr) return json({ error: inviteErr.message }, 400)

    const { error: upsertErr } = await adminClient.from('app_users').upsert({ user_id: invite.user.id, email, display_name: displayName, role, active: true }, { onConflict: 'user_id' })
    if (upsertErr) return json({ error: upsertErr.message }, 500)

    return json({ ok: true, email, role })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Ukjent feil.' }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}
