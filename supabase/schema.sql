-- rastegar.se — backend for highscores and the guestbook.
--
-- Paste this whole file into the Supabase SQL editor and run it once. It is
-- safe to run again: everything is create-if-not-exists or create-or-replace.
--
-- Design, in one line: the browser may READ the boards and the wall, and may
-- WRITE only by calling the three functions at the bottom, which do the
-- checking. Row Level Security blocks every direct write, so a forged request
-- has nothing to forge.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- catalogue
-- One row per game. max_score and max_rate are the plausibility limits used
-- when a score is submitted: nothing above max_score is ever accepted, and a
-- run cannot earn faster than max_rate points per second.
create table if not exists public.games (
  slug        text primary key,
  title       text not null,
  max_score   integer not null,
  max_rate    numeric not null,
  min_seconds integer not null default 5
);

insert into public.games (slug, title, max_score, max_rate, min_seconds) values
  ('one-piece-quiz', 'One Piece Quiz', 6000,   40, 20),
  ('naruto-quiz',    'Naruto Quiz',    6000,   40, 20),
  ('slash',          'Slash',          200000, 900, 5),
  ('panel-dash',     'Panel Dash',     200000, 900, 5),
  ('paj-says-survive', 'Paj Says Survive', 250000, 500, 10)
on conflict (slug) do update
  set title = excluded.title,
      max_score = excluded.max_score,
      max_rate = excluded.max_rate,
      min_seconds = excluded.min_seconds;

-- --------------------------------------------------------------------- runs
-- A token handed out when a game starts and burned when a score is posted.
-- No token, no score.
create table if not exists public.runs (
  token      uuid primary key default gen_random_uuid(),
  game       text not null references public.games(slug),
  started_at timestamptz not null default now(),
  used_at    timestamptz,
  client     text
);

create index if not exists runs_client_idx on public.runs (client, started_at desc);

-- ------------------------------------------------------------------- scores
create table if not exists public.scores (
  id         bigint generated always as identity primary key,
  game       text not null references public.games(slug),
  name       text not null,
  score      integer not null check (score >= 0),
  created_at timestamptz not null default now()
);

create index if not exists scores_board_idx on public.scores (game, score desc, created_at);

-- ---------------------------------------------------------------- guestbook
-- Moderation: open the table in the Supabase Table Editor and either tick
-- `hidden` (keeps the row, hides it from the site) or delete the row.
create table if not exists public.guestbook (
  id         bigint generated always as identity primary key,
  name       text not null,
  message    text not null,
  created_at timestamptz not null default now(),
  hidden     boolean not null default false,
  client     text
);

create index if not exists guestbook_recent_idx on public.guestbook (created_at desc);

-- ------------------------------------------------------- row level security
alter table public.games     enable row level security;
alter table public.runs      enable row level security;
alter table public.scores    enable row level security;
alter table public.guestbook enable row level security;

drop policy if exists "games are public" on public.games;
create policy "games are public" on public.games for select using (true);

drop policy if exists "scores are public" on public.scores;
create policy "scores are public" on public.scores for select using (true);

drop policy if exists "visible entries are public" on public.guestbook;
create policy "visible entries are public" on public.guestbook
  for select using (hidden = false);

-- No policies at all on `runs`: nobody reaches it except the functions below,
-- which run as the table owner. No insert/update/delete policy anywhere, so
-- the anon key cannot write a single row directly.

-- Column-level grants: the site reads exactly these columns and nothing else,
-- so the `client` bookkeeping column never leaves the database.
revoke all on public.games, public.runs, public.scores, public.guestbook from anon, authenticated;
grant select (slug, title) on public.games to anon, authenticated;
grant select (game, name, score, created_at) on public.scores to anon, authenticated;
grant select (id, name, message, created_at) on public.guestbook to anon, authenticated;

-- ---------------------------------------------------------------- functions

-- Best-effort client identity for rate limiting. PostgREST forwards the
-- caller's address in a header; behind proxies the first entry is the client.
create or replace function public.client_key()
returns text
language sql
stable
as $$
  select coalesce(
    split_part(
      nullif(current_setting('request.headers', true), '')::json ->> 'x-forwarded-for',
      ',', 1),
    'unknown');
$$;

-- Hand out a run token. Called when a game actually starts.
create or replace function public.start_run(p_game text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client text := client_key();
  v_recent integer;
  v_token  uuid;
begin
  if not exists (select 1 from games where slug = p_game) then
    raise exception 'Unknown game.';
  end if;

  select count(*) into v_recent
    from runs
   where client = v_client
     and started_at > now() - interval '1 minute';

  if v_recent > 40 then
    raise exception 'Too many runs started. Take a breath.';
  end if;

  insert into runs (game, client) values (p_game, v_client)
  returning token into v_token;

  return v_token;
end;
$$;

-- Post a score. Everything that can be checked, is checked here.
-- Returns the new row's id: a function returning void answers with an empty
-- body, which is awkward for the caller to tell apart from a failure.
create or replace function public.submit_score(p_token uuid, p_name text, p_score integer)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run     runs%rowtype;
  v_game    games%rowtype;
  v_seconds numeric;
  v_client  text := client_key();
  v_recent  integer;
  v_id      bigint;
begin
  p_name := btrim(coalesce(p_name, ''));

  if p_name !~ '^[A-Za-z0-9 _.-]{3,12}$' then
    raise exception 'Names are 3 to 12 characters: letters, numbers, space, - _ .';
  end if;

  select * into v_run from runs where token = p_token for update;
  if not found then
    raise exception 'This run cannot be scored. Play a fresh round.';
  end if;
  if v_run.used_at is not null then
    raise exception 'That run has already been posted.';
  end if;

  select * into v_game from games where slug = v_run.game;
  v_seconds := extract(epoch from (now() - v_run.started_at));

  if v_seconds > 21600 then                                   -- six hours
    raise exception 'That run is too old to post.';
  end if;
  if v_seconds < v_game.min_seconds then
    raise exception 'That was too fast to be a real run.';
  end if;
  if p_score < 0 or p_score > v_game.max_score then
    raise exception 'That score is not possible in this game.';
  end if;
  if p_score > v_game.max_rate * v_seconds then
    raise exception 'That score is not possible in the time the run took.';
  end if;

  select count(*) into v_recent
    from runs
   where client = v_client
     and used_at > now() - interval '1 minute';

  if v_recent > 10 then
    raise exception 'Too many scores at once.';
  end if;

  update runs set used_at = now() where token = p_token;
  insert into scores (game, name, score) values (v_run.game, p_name, p_score)
  returning id into v_id;
  return v_id;
end;
$$;

-- Sign the guestbook. p_website is the honeypot: a real person never fills it.
create or replace function public.sign_guestbook(p_name text, p_message text, p_website text default '')
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client text := client_key();
  v_recent integer;
  v_id     bigint;
begin
  if coalesce(btrim(p_website), '') <> '' then
    return 0;                     -- a bot filled the hidden field: quietly drop it
  end if;

  p_name := btrim(coalesce(p_name, ''));
  p_message := btrim(coalesce(p_message, ''));

  if char_length(p_name) < 2 or char_length(p_name) > 24 then
    raise exception 'Name is 2 to 24 characters.';
  end if;
  if char_length(p_message) < 2 or char_length(p_message) > 500 then
    raise exception 'Message is 2 to 500 characters.';
  end if;

  select count(*) into v_recent
    from guestbook
   where client = v_client
     and created_at > now() - interval '1 hour';

  if v_recent >= 3 then
    raise exception 'You have signed a few times already. Come back later.';
  end if;

  if exists (select 1 from guestbook
              where message = p_message
                and created_at > now() - interval '1 day') then
    raise exception 'That message is already on the wall.';
  end if;

  insert into guestbook (name, message, client) values (p_name, p_message, v_client)
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.start_run(text) from public;
revoke all on function public.submit_score(uuid, text, integer) from public;
revoke all on function public.sign_guestbook(text, text, text) from public;
grant execute on function public.start_run(text) to anon, authenticated;
grant execute on function public.submit_score(uuid, text, integer) to anon, authenticated;
grant execute on function public.sign_guestbook(text, text, text) to anon, authenticated;

-- --------------------------------------------------------------- house-keeping
-- Unused run tokens are litter. Delete anything older than a day.
create or replace function public.prune_runs()
returns void
language sql
security definer
set search_path = public
as $$
  delete from runs where started_at < now() - interval '1 day';
$$;
