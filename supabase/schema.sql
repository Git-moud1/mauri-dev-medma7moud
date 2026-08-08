-- Schema for the content store, migrated off Netlify Blobs.
--
-- ALREADY APPLIED to project eglcgjliyrvymelhawjn (myw1-portfolio, eu-west-3)
-- as the migrations `initial_content_store` and `restrict_touch_updated_at_execute`.
-- This file is the readable source of truth for that state; it does not need to
-- be run again, and it is idempotent if it is.
--
-- Future changes go through a NEW migration, not the SQL editor and not an edit
-- here — an edit alone changes nothing in the database.
--
-- Shapes here mirror the zod schemas in src/lib/content/types.ts. Where the two
-- could drift, Postgres is the stricter of the pair on purpose: the app already
-- validates on write, so these constraints exist to catch a writer that does
-- not — including this repo's own migration script.

-- ---------------------------------------------------------------------------
-- projects
-- ---------------------------------------------------------------------------
--
-- `position` carries what used to be array order in projects.json. The array
-- was the ordering mechanism; a table has no inherent order, so it becomes a
-- column and `moveProject` becomes a swap of two values.
--
-- UNIQUE is DEFERRABLE INITIALLY DEFERRED so that swap can be two plain UPDATEs
-- inside one transaction. Without the deferral the first UPDATE would collide
-- with the row it is about to displace, and the swap would need a temporary
-- sentinel value — an extra write, and a broken ordering if the transaction
-- died between the three statements.
create table if not exists public.projects (
  -- Immutable after creation: it names the storage folder and appears in any
  -- link already shared with a client. Same regex the zod schema enforces.
  id text primary key
    constraint projects_id_slug check (id ~ '^[a-z0-9-]+$'),

  position integer not null,

  -- jsonb rather than three columns each: nothing queries by locale, and this
  -- round-trips through the existing `localizedString` schema untouched. Every
  -- locale is required — a half-translated project is the exact state the
  -- Record<Locale, string> type exists to prevent.
  title jsonb not null
    constraint projects_title_locales check (
      length(coalesce(title ->> 'ar', '')) > 0 and
      length(coalesce(title ->> 'en', '')) > 0 and
      length(coalesce(title ->> 'fr', '')) > 0
    ),
  description jsonb not null
    constraint projects_description_locales check (
      length(coalesce(description ->> 'ar', '')) > 0 and
      length(coalesce(description ->> 'en', '')) > 0 and
      length(coalesce(description ->> 'fr', '')) > 0
    ),

  -- Drives the filter pills and the lightbox layout. Not the same as `frame`.
  category text not null
    constraint projects_category check (category in ('web', 'app')),
  -- Drives the card cover only. Not the same as `category`.
  frame text not null default 'browser'
    constraint projects_frame check (frame in ('phone', 'browser')),

  cover text not null
    constraint projects_cover_present check (length(cover) > 0),

  images jsonb not null default '[]'::jsonb
    constraint projects_images_array check (jsonb_typeof(images) = 'array'),

  -- NULL, never ''. The zod schema preprocesses '' to undefined because that is
  -- how the bundled catalogue spells "no live link"; the SQL equivalent of
  -- absent is NULL, and allowing both would give the same fact two spellings.
  --
  -- https only: an http link on a page shown to prospective clients is a
  -- mixed-content warning in front of them.
  link text
    constraint projects_link_https check (link is null or link like 'https://%'),

  -- Per project, not per image, matching the current JSON. Odd next to an
  -- `images` array, but preserved rather than reshaped — changing it is its own
  -- job, not a migration side effect.
  blur_data_url text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint projects_position_unique unique (position) deferrable initially deferred
);

-- ---------------------------------------------------------------------------
-- site_settings
-- ---------------------------------------------------------------------------
--
-- Exactly one row, enforced by the primary key check rather than by convention.
-- The alternative — key/value rows — would lose the schema shape and force
-- every read to reassemble the object.
--
-- Stores the zod INPUT shape. `whatsappUrl` is derived by settingsSchema's
-- .transform() and is deliberately not a column: two fields holding the same
-- number drift apart eventually.
create table if not exists public.site_settings (
  id smallint primary key default 1
    constraint site_settings_singleton check (id = 1),

  -- Optional like every other platform. An owner who has not published a number
  -- should not be blocked from saving the rest of the form.
  whatsapp_number text,
  email text,

  -- Keyed object of six optional platforms. Left as jsonb rather than six
  -- columns so `migrateSocials` keeps working: pre-v2 rows arrive as a
  -- {platform, url, label}[] array and are folded on read, which means this
  -- column must be able to hold either shape during the transition.
  socials jsonb not null default '{}'::jsonb
    constraint site_settings_socials_object check (jsonb_typeof(socials) = 'object'),

  hero_stats jsonb not null
    constraint site_settings_hero_stats check (
      (hero_stats ->> 'years')::int >= 0 and
      (hero_stats ->> 'projects')::int >= 0 and
      (hero_stats ->> 'stacks')::int >= 0
    ),

  available_for_work boolean not null default true,

  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- auth_attempts
-- ---------------------------------------------------------------------------
--
-- Replaces the third Netlify Blobs store, `auth-attempts`. Same policy as
-- src/lib/auth/rate-limit.ts: five failures per ten minutes per IP, then a
-- fifteen-minute lockout, and the reader FAILS OPEN on any error — the password
-- is the actual gate, and a store outage locking the owner out of their own
-- admin panel would be a self-inflicted denial of service.
create table if not exists public.auth_attempts (
  -- Sanitised by the caller before it arrives; the column is keyed by it, not
  -- trusted for anything else.
  ip text primary key,
  count integer not null default 0,
  first_at timestamptz not null default now(),
  locked_until timestamptz
);

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- PostgREST exposes every function in `public` at /rest/v1/rpc/<name>, and
-- PUBLIC holds EXECUTE on a new function by default — which made this
-- SECURITY DEFINER function callable by `anon` (Supabase advisor lint 0028).
-- It is a trigger function, never an RPC, so nobody should be able to call it.
--
-- Safe to revoke after the fact: Postgres checks EXECUTE on a trigger function
-- when the trigger is CREATEd, not each time it fires.
revoke all on function public.touch_updated_at() from public, anon, authenticated;

drop trigger if exists projects_touch_updated_at on public.projects;
create trigger projects_touch_updated_at
  before update on public.projects
  for each row execute function public.touch_updated_at();

drop trigger if exists site_settings_touch_updated_at on public.site_settings;
create trigger site_settings_touch_updated_at
  before update on public.site_settings
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security: deny all
-- ---------------------------------------------------------------------------
--
-- RLS is enabled with NO policies on every table, which denies the `anon` and
-- `authenticated` roles outright. Nothing is lost: every read and write in this
-- app runs server-side with the secret key, which bypasses RLS by design.
--
-- The point is the failure mode. If SUPABASE_URL ever leaks — and the URL is
-- not a secret — there is no anonymous path to this data. A table with RLS off
-- would be readable by anyone holding the publishable key.
alter table public.projects       enable row level security;
alter table public.site_settings  enable row level security;
alter table public.auth_attempts  enable row level security;

-- Belt and braces alongside RLS: revoke the grants PostgREST's roles get by
-- default, so a future policy added by accident still has nothing to grant.
revoke all on public.projects      from anon, authenticated;
revoke all on public.site_settings from anon, authenticated;
revoke all on public.auth_attempts from anon, authenticated;

-- ---------------------------------------------------------------------------
-- replace_projects
-- ---------------------------------------------------------------------------
--
-- Replace the whole project list in one transaction. The admin edits an ordered
-- array — that is what the blob held, and what moveProject still splices. Doing
-- it from the client would take an upsert plus a delete-the-missing as two
-- PostgREST requests, i.e. two transactions, with a window where a failed
-- second call leaves a deleted project live on the site.
--
-- It is also what makes projects_position_unique DEFERRABLE worth having: a
-- reorder writes colliding positions mid-statement and only has to be
-- consistent at COMMIT.
--
-- `position` is derived from array order here rather than sent by the caller,
-- so the array stays the single ordering mechanism end to end.
create or replace function public.replace_projects(payload jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if jsonb_typeof(payload) <> 'array' then
    raise exception 'replace_projects expects a JSON array, got %',
      coalesce(jsonb_typeof(payload), 'null');
  end if;

  -- NOT EXISTS rather than NOT IN: a NULL id anywhere in the payload makes
  -- `id not in (...)` evaluate to NULL for every row and silently delete
  -- nothing. An empty array still means "delete everything", which is correct.
  delete from public.projects p
  where not exists (
    select 1
    from jsonb_array_elements(payload) as e(value)
    where e.value ->> 'id' = p.id
  );

  insert into public.projects as p (
    id, position, title, description, category, frame, cover, images, link, blur_data_url
  )
  select
    e.value ->> 'id',
    (e.ordinality - 1)::int,
    e.value -> 'title',
    e.value -> 'description',
    e.value ->> 'category',
    coalesce(e.value ->> 'frame', 'browser'),
    e.value ->> 'cover',
    coalesce(e.value -> 'images', '[]'::jsonb),
    nullif(e.value ->> 'link', ''),
    e.value ->> 'blurDataURL'
  from jsonb_array_elements(payload) with ordinality as e(value, ordinality)
  on conflict (id) do update set
    position      = excluded.position,
    title         = excluded.title,
    description   = excluded.description,
    category      = excluded.category,
    frame         = excluded.frame,
    cover         = excluded.cover,
    images        = excluded.images,
    link          = excluded.link,
    blur_data_url = excluded.blur_data_url;
    -- created_at is deliberately not in the SET list: an edit is not a creation.
end;
$$;

-- This one rewrites the entire catalogue, so anon reaching it would be a total
-- content takeover with only the publishable key. Server-side calls use the
-- secret key and run as service_role, which is unaffected.
revoke all on function public.replace_projects(jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------
--
-- The `site-media` bucket is created by scripts/migrate-to-supabase.mjs, which
-- needs it to exist before it can upload and is the only thing that knows
-- whether this is a first run.
--
-- It is PRIVATE, and stays private: /api/media/<key> reads it server-side with
-- the secret key and proxies the bytes. Nothing in a browser ever talks to
-- Supabase Storage directly, so a public bucket would widen access for no gain.
