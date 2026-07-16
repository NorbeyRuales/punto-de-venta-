-- Conserva por separado la explicación de faltantes o sobrantes del cierre.
alter table public.cash_sessions
  add column if not exists difference_note text;

comment on column public.cash_sessions.difference_note is
  'Justificación registrada por el responsable cuando el cierre presenta diferencia.';
