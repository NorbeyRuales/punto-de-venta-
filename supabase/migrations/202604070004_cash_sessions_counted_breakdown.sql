-- Fase 5: arqueo detallado por denominaciones (billetes y monedas).
-- Cambio aditivo y compatible con cierres existentes.

alter table public.cash_sessions
  add column if not exists counted_cash_breakdown jsonb;

alter table public.cash_sessions
  drop constraint if exists cash_sessions_counted_cash_breakdown_chk;

alter table public.cash_sessions
  add constraint cash_sessions_counted_cash_breakdown_chk
  check (
    counted_cash_breakdown is null
    or jsonb_typeof(counted_cash_breakdown) = 'object'
  );
