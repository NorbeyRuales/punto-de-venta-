-- Conserva el nombre visible de los responsables aunque el usuario cambie o sea eliminado.
alter table public.cash_sessions
  add column if not exists opened_by_name text,
  add column if not exists closed_by_name text;
