-- Fixes the search_path of take_order_stock (Supabase security advisor:
-- "Function Search Path Mutable"). With an empty search_path the function
-- cannot be tricked into using a look-alike table or function from another
-- schema; it already names every table as public.<table>, and the built-in
-- functions it uses (jsonb_build_object, greatest, ...) live in pg_catalog,
-- which is always searched. Run after 0005. Safe to run more than once.

alter function public.take_order_stock(uuid) set search_path = '';
