-- Moneda preferată în care utilizatorul vede prețurile (EUR sau RON).
-- Prețurile vin de la Kiwi în EUR; în RON le convertește pagina cu cursul BCE al zilei (Frankfurter).
-- Bugetul rămâne salvat în EUR (budget_max_eur), indiferent de monedă.
-- Idempotentă: se poate rula de mai multe ori.
alter table public.search_preferences
  add column if not exists currency text not null default 'EUR';

do $$ begin
  alter table public.search_preferences
    add constraint search_preferences_currency_check check (currency in ('EUR', 'RON'));
exception when duplicate_object then null; end $$;

-- PostgREST trebuie să vadă coloana nouă imediat.
notify pgrst, 'reload schema';
