-- Gutta Hjelper V6: simplified single-business production schema.
create extension if not exists pgcrypto;

create table public.app_users(
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  display_name text,
  role text not null check(role in('admin','worker')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.jobs(
  id uuid primary key default gen_random_uuid(),job_no text not null unique,
  customer text not null,phone text,service text not null,job_date date not null,area text,
  agreed_price numeric(12,2) not null default 0 check(agreed_price>=0),
  status text not null default 'Forespørsel' check(status in('Forespørsel','Tilbud sendt','Planlagt','Pågår','Fullført','Fakturagrunnlag','Betalt','Kansellert','Avvist')),
  description text,internal_notes text,created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table public.work_entries(
  id uuid primary key default gen_random_uuid(),job_id uuid not null references public.jobs(id) on delete cascade,
  user_id uuid not null default auth.uid(),entry_date date not null,
  entry_type text not null check(entry_type in('hours','equipment','transport','note')),
  quantity numeric(10,2) check(quantity is null or quantity>=0),unit text,description text,equipment text,
  km numeric(10,2) check(km is null or km>=0),trips integer check(trips is null or trips>=0),
  created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table public.expenses(
  id uuid primary key default gen_random_uuid(),job_id uuid not null references public.jobs(id) on delete cascade,
  user_id uuid not null default auth.uid(),expense_date date not null,supplier text,category text,
  amount numeric(12,2) not null check(amount>=0),notes text,receipt_path text,
  created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table public.job_photos(
  id uuid primary key default gen_random_uuid(),job_id uuid not null references public.jobs(id) on delete cascade,
  user_id uuid not null default auth.uid(),kind text not null check(kind in('before','after','other')),
  storage_path text not null unique,created_at timestamptz not null default now()
);
create sequence public.job_no_seq start 1;

create or replace function public.current_role() returns text language sql stable security definer set search_path=public as $$
  select role from app_users where user_id=auth.uid() and active
$$;
revoke all on function public.current_role() from public;grant execute on function public.current_role() to authenticated;

create or replace function public.create_job(p_customer text,p_phone text,p_service text,p_job_date date,p_area text,p_agreed_price numeric,p_status text,p_description text,p_internal_notes text)
returns public.jobs language plpgsql security definer set search_path=public,pg_temp as $$declare j public.jobs;begin
  if public.current_role()<>'admin' then raise exception 'admin required' using errcode='42501';end if;
  if nullif(btrim(p_customer),'') is null or nullif(btrim(p_service),'') is null or p_job_date is null then raise exception 'missing required details';end if;
  insert into jobs(job_no,customer,phone,service,job_date,area,agreed_price,status,description,internal_notes)
  values('GH-'||to_char(p_job_date,'YYYY')||'-'||lpad(nextval('job_no_seq')::text,5,'0'),btrim(p_customer),nullif(btrim(coalesce(p_phone,'')),''),btrim(p_service),p_job_date,nullif(btrim(coalesce(p_area,'')),''),coalesce(p_agreed_price,0),p_status,p_description,p_internal_notes)
  returning * into j;return j;
end$$;

-- Adds an already-created Supabase Auth user by email. Auth invitation/account creation stays in Supabase Dashboard.
create or replace function public.add_app_user(p_email text,p_role text default 'worker',p_display_name text default null)
returns public.app_users language plpgsql security definer set search_path=public,auth,pg_temp as $$declare uid uuid;u public.app_users;begin
  if public.current_role()<>'admin' then raise exception 'admin required' using errcode='42501';end if;
  if p_role not in('admin','worker') then raise exception 'invalid role';end if;
  select id into uid from auth.users where lower(email)=lower(btrim(p_email));
  if uid is null then raise exception 'Auth user not found. Invite the user in Supabase Authentication first.';end if;
  insert into public.app_users(user_id,email,display_name,role,active)
  values(uid,lower(btrim(p_email)),nullif(btrim(coalesce(p_display_name,'')),''),p_role,true)
  on conflict(user_id) do update set email=excluded.email,display_name=excluded.display_name,role=excluded.role,active=true
  returning * into u;return u;
end$$;
create or replace function public.set_app_user_active(p_user_id uuid,p_active boolean)
returns void language plpgsql security definer set search_path=public,pg_temp as $$begin
  if public.current_role()<>'admin' then raise exception 'admin required' using errcode='42501';end if;
  if p_user_id=auth.uid() and not p_active then raise exception 'cannot deactivate your own account';end if;
  update app_users set active=p_active where user_id=p_user_id;
end$$;
revoke all on function public.create_job(text,text,text,date,text,numeric,text,text,text),public.add_app_user(text,text,text),public.set_app_user_active(uuid,boolean) from public,anon;
grant execute on function public.create_job(text,text,text,date,text,numeric,text,text,text),public.add_app_user(text,text,text),public.set_app_user_active(uuid,boolean) to authenticated;

alter table public.app_users enable row level security;alter table public.jobs enable row level security;alter table public.work_entries enable row level security;alter table public.expenses enable row level security;alter table public.job_photos enable row level security;
revoke all on all tables in schema public from anon,authenticated;
grant select on public.app_users,public.jobs,public.work_entries,public.expenses,public.job_photos to authenticated;
grant update on public.jobs to authenticated;
grant insert,update,delete on public.work_entries,public.expenses,public.job_photos to authenticated;
create policy users_read on app_users for select to authenticated using(user_id=auth.uid() or public.current_role()='admin');
create policy jobs_read on jobs for select to authenticated using(public.current_role() in('admin','worker'));
create policy jobs_admin_update on jobs for update to authenticated using(public.current_role()='admin') with check(public.current_role()='admin');
create policy work_read on work_entries for select to authenticated using(public.current_role()='admin' or user_id=auth.uid());
create policy work_insert on work_entries for insert to authenticated with check(public.current_role() in('admin','worker') and user_id=auth.uid());
create policy work_change on work_entries for update to authenticated using(user_id=auth.uid() or public.current_role()='admin') with check(user_id=auth.uid() or public.current_role()='admin');
create policy work_delete on work_entries for delete to authenticated using(user_id=auth.uid() or public.current_role()='admin');
create policy expense_read on expenses for select to authenticated using(public.current_role()='admin' or user_id=auth.uid());
create policy expense_insert on expenses for insert to authenticated with check(public.current_role() in('admin','worker') and user_id=auth.uid());
create policy expense_change on expenses for update to authenticated using(user_id=auth.uid() or public.current_role()='admin') with check(user_id=auth.uid() or public.current_role()='admin');
create policy expense_delete on expenses for delete to authenticated using(user_id=auth.uid() or public.current_role()='admin');
create policy photo_read on job_photos for select to authenticated using(public.current_role() in('admin','worker'));
create policy photo_insert on job_photos for insert to authenticated with check(public.current_role() in('admin','worker') and user_id=auth.uid());
create policy photo_delete on job_photos for delete to authenticated using(user_id=auth.uid() or public.current_role()='admin');

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('gh-files','gh-files',false,5242880,array['image/jpeg','image/png','image/webp']) on conflict(id) do update set public=false,file_size_limit=5242880,allowed_mime_types=array['image/jpeg','image/png','image/webp'];
create policy gh_files_read on storage.objects for select to authenticated using(bucket_id='gh-files' and public.current_role() in('admin','worker'));
create policy gh_files_insert on storage.objects for insert to authenticated with check(bucket_id='gh-files' and public.current_role() in('admin','worker') and owner_id=auth.uid()::text);
create policy gh_files_delete on storage.objects for delete to authenticated using(bucket_id='gh-files' and (owner_id=auth.uid()::text or public.current_role()='admin'));

alter publication supabase_realtime add table public.jobs;alter publication supabase_realtime add table public.work_entries;alter publication supabase_realtime add table public.expenses;alter publication supabase_realtime add table public.job_photos;alter publication supabase_realtime add table public.app_users;
-- Bootstrap first admin after creating that Auth account:
-- insert into public.app_users(user_id,email,display_name,role) values('AUTH_USER_UUID','admin@example.no','Administrator','admin');
