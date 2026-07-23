/*
  # Bond Security Master rebuild — remove the old Bond Creation module

  Owner-authorized destructive rebuild. Drops every object from the previous
  bond module (nw_bonds + children, the catalog view, all nw_bond_* RPCs, the
  code sequence, and the bond-documents storage policies). The proven math from
  the old cashflow engine is carried into the new analytics engine in code, not
  kept in the DB. Idempotent.
*/

-- Tables (CASCADE removes their triggers, policies, FKs, and the catalog view's
-- dependency chain).
DROP TABLE IF EXISTS nw_generated_marketing_pdfs CASCADE;
DROP TABLE IF EXISTS nw_bond_versions            CASCADE;
DROP TABLE IF EXISTS nw_bond_documents           CASCADE;
DROP TABLE IF EXISTS nw_bonds                    CASCADE;

DROP VIEW IF EXISTS nw_bonds_catalog CASCADE;

-- Drop every overload of the old bond functions by name.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('nw_bond_insert_batch','nw_bond_log_marketing_pdf',
                         'nw_bond_selling_price','nw_bonds_touch','nw_bonds_version',
                         'nw_next_bond_code','nw_can_see_bond')
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;

DROP SEQUENCE IF EXISTS nw_bond_code_seq;

-- Old storage policies for the bond-documents bucket (bucket itself left in place;
-- it is empty after the table drop and harmless).
DROP POLICY IF EXISTS "Admins upload bond-documents" ON storage.objects;
DROP POLICY IF EXISTS "Staff read bond-documents"    ON storage.objects;
DROP POLICY IF EXISTS "Admins delete bond-documents" ON storage.objects;
