-- The host directory (D1). Apply with: npx wrangler d1 execute citizens-hosts --remote --file schema.sql
create table if not exists hosts (
  pubkey text primary key,
  url text not null,
  name text,
  v text,
  ev text not null,          -- the host's signed announcement (hosts/<pubkey>), so apps can check it themselves
  count integer default 0,   -- records it held at its last check
  first_ok integer, last_ok integer, last_check integer,
  oks integer default 0, fails integer default 0, consec integer default 0, bad_until integer default 0,
  updated integer
);
create index if not exists hosts_url on hosts(url);
-- Feedback from the site and the app (POST /api/feedback). Private: only the party reads it (tools/feedback.py).
create table if not exists feedback (
  id integer primary key autoincrement,
  at integer not null,
  msg text not null,
  name text,
  email text,
  page text,                 -- where it was sent from (landing, app, …)
  who text                   -- a hash of the sender's address and the day, only to limit how often one sender posts
);
create index if not exists feedback_who on feedback(who, at);
