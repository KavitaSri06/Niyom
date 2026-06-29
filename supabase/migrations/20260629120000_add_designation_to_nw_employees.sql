-- Add display-only `designation` (job title) to nw_employees.
-- IMPORTANT: This is for display only. Authorization stays on nw_employees.role
-- (super_admin / admin / employee) — that column is NOT changed here.

ALTER TABLE nw_employees ADD COLUMN IF NOT EXISTS designation text;

-- Populate per spec (case/space-insensitive name match).
UPDATE nw_employees SET designation = 'Designated Partner'
  WHERE lower(trim(full_name)) IN ('purushothaman s', 'ramya n');

UPDATE nw_employees SET designation = 'Senior Relationship Manager'
  WHERE lower(trim(full_name)) IN ('prabhu s', 'bhuvaneswari r');

-- Everyone else (and any unmatched) → Relationship Manager.
UPDATE nw_employees SET designation = 'Relationship Manager'
  WHERE designation IS NULL;
