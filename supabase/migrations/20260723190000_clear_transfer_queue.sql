/*
  # Clear the Transfer Queue — mark already-booked deals as transferred

  The queue still lists DC-1784013251498 (deal 4e2b9643, PATERSON, Fusion-ICEX
  ₹12,500) because its real transaction f8f5bfce is linked to the deal but has
  transfer_stage = NULL (it started as a manual entry). The queue lists any deal
  whose transaction isn't 'transferred', so it kept showing even though the
  business is already booked (in MIS, with its DSA payout).

  Finalize every currently-eligible deal that already has a transaction by
  marking that transaction 'transferred'. Non-destructive: MIS revenue, holdings
  and DSA payouts are unchanged; the deal simply leaves the queue. OLD.stage is
  NULL, so the post-transfer immutability guard does not fire.
*/

UPDATE nw_transactions t
   SET transfer_stage   = 'transferred',
       transferred_at   = COALESCE(t.transferred_at, now()),
       transferred_by   = COALESCE(t.transferred_by, t.employee_id),
       transfer_remarks = COALESCE(NULLIF(t.transfer_remarks, ''),
                                   'Marked transferred to clear the Transfer Queue (business already booked)'),
       updated_at       = now()
 WHERE t.deal_confirmation_id IN (SELECT deal_id FROM nw_deal_transfer_eligible)
   AND t.transfer_stage IS DISTINCT FROM 'transferred';

DO $$
DECLARE v_left int;
BEGIN
  SELECT count(*) INTO v_left FROM nw_deal_transfer_eligible;
  RAISE NOTICE 'Transfer Queue now has % deal(s).', v_left;
END $$;
