/*
  # Backfill coverage for existing debit notes

  Records which transactions each existing (non-cancelled) note already covers,
  so the payout view knows not to re-surface them as "pending". Matches each
  pdf_snapshot particular to a transaction by client_code + product_name +
  quantity within the note's month (snapshot fields come from the transaction,
  so these are exact matches), greedily skipping any transaction already linked.

  Verified against production by simulation before writing (read-only):
    - 6 notes link fully (linked = stored). DN-2026-07-0005 links its ₹5,000 and
      correctly leaves S SHALINI's later ₹1,500 uncovered — that becomes the new
      pending payout.
    - 10 notes link ₹0: their transactions no longer exist live (or carry no DSA
      pricing, so they're payout-ineligible) — nothing to link and nothing to
      re-bill. Their pdf_snapshot remains the audit record.
    - 0 notes over-cover.

  Idempotent: already-linked transactions are skipped, so re-running is a no-op.
  Aborts if any note would link MORE than its stored payout (double-billing).
*/

DO $$
DECLARE
  n        record;
  p        jsonb;
  v_txn    uuid;
  v_start  text;
  v_end    text;
  v_linked int := 0;
BEGIN
  FOR n IN
    SELECT id, dsa_id, month, year, debit_note_number, pdf_snapshot
      FROM dsa_debit_notes
     WHERE status <> 'cancelled'
       AND pdf_snapshot ? 'particulars'
  LOOP
    v_start := n.year::text || '-' || lpad(n.month::text, 2, '0') || '-01';
    v_end   := n.year::text || '-' || lpad(n.month::text, 2, '0') || '-31';

    FOR p IN SELECT jsonb_array_elements(n.pdf_snapshot->'particulars')
    LOOP
      SELECT t.id INTO v_txn
        FROM nw_transactions t
        JOIN nw_clients c ON c.id = t.client_id
       WHERE c.dsa_id = n.dsa_id
         AND c.client_code = (p->>'client_code')
         AND t.product_name = (p->>'product_name')
         AND t.quantity = (p->>'quantity')::numeric
         AND t.txn_date::text >= v_start
         AND t.txn_date::text <= v_end
         AND NOT EXISTS (SELECT 1 FROM dsa_debit_note_lines l WHERE l.transaction_id = t.id)
       LIMIT 1;

      IF v_txn IS NOT NULL THEN
        INSERT INTO dsa_debit_note_lines (debit_note_id, transaction_id, payout)
        VALUES (n.id, v_txn, COALESCE((p->>'payout')::numeric, 0))
        ON CONFLICT (transaction_id) DO NOTHING;
        v_linked := v_linked + 1;
        v_txn := NULL;
      END IF;
    END LOOP;
  END LOOP;

  RAISE NOTICE 'Backfill linked % transaction line(s).', v_linked;

  -- Safety: a note must never link MORE than its stored payout.
  FOR n IN
    SELECT dn.debit_note_number, dn.payout_amount AS stored,
           COALESCE(SUM(l.payout), 0) AS linked
      FROM dsa_debit_notes dn
      LEFT JOIN dsa_debit_note_lines l ON l.debit_note_id = dn.id
     WHERE dn.status <> 'cancelled'
     GROUP BY dn.id, dn.debit_note_number, dn.payout_amount
  LOOP
    IF n.linked > n.stored + 0.5 THEN
      RAISE EXCEPTION 'Aborting: % over-covered (linked % > stored %).',
        n.debit_note_number, n.linked, n.stored;
    END IF;
  END LOOP;
END $$;
