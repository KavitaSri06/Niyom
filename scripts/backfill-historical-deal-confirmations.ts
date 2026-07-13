/**
 * Sprint 6A.1 — Historical Deal Confirmation Backfill (ONE-TIME utility)
 * ---------------------------------------------------------------------------
 * Standalone Deno script. NOT part of the CRM runtime, NOT an Edge Function.
 * Run manually by an admin with service-role credentials.
 *
 * It back-files the signed Deal Confirmation PDF of every HISTORICAL accepted
 * deal into the client Documents vault, exactly matching what Sprint 6A does
 * for new acceptances — so past clients get the same experience.
 *
 * Guarantees:
 *   • Idempotent / retry-safe / resumable — skips deals already filed (by the
 *     deterministic vault file_path, shared with Sprint 6A).
 *   • Read-only against nw_deal_confirmations and deal-documents (source of
 *     truth is never modified). The only writes are: upload into crm-documents
 *     and insert into nw_documents. The DB row is inserted ONLY after a verified
 *     successful upload.
 *   • Per-record try/catch — one failure never stops the run; all failures are
 *     collected and reported.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     deno run --allow-net --allow-env scripts/backfill-historical-deal-confirmations.ts          # DRY RUN (default)
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     deno run --allow-net --allow-env scripts/backfill-historical-deal-confirmations.ts --execute # PERFORM
 *
 * Env:
 *   SUPABASE_URL                (required)
 *   SUPABASE_SERVICE_ROLE_KEY   (required — service role; grants storage + RLS bypass)
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const SOURCE_BUCKET = "deal-documents";
const VAULT_BUCKET = "crm-documents";
const PAGE_SIZE = 100;

// Metadata (Sprint 6A.1 requirements)
const UPLOADED_BY_NAME = "Historical signed copy (backfill)";

// Deterministic destination path — MUST stay identical to Sprint 6A so the two
// are mutually idempotent.
function vaultPathFor(clientCode: string, confirmationNumber: string): string {
  return `clients/${clientCode}/DEAL_CONFIRMATION/Signed_Deal_Confirmation_${confirmationNumber}.pdf`;
}
function fileNameFor(confirmationNumber: string): string {
  return `Signed_Deal_Confirmation_${confirmationNumber}.pdf`;
}

interface DealRow {
  id: string;
  confirmation_number: string;
  client_id: string;
  employee_id: string | null;
  accepted_at: string | null;
  signed_pdf_path: string | null;
  client: { client_code: string } | null;
}

interface Failure {
  deal_id: string;
  confirmation_number: string;
  reason: string;
}

async function main() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    console.error("ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
    Deno.exit(1);
  }

  const execute = Deno.args.includes("--execute");
  const mode = execute ? "EXECUTE" : "DRY RUN";
  console.log(`\n=== Sprint 6A.1 — Historical Deal Confirmation Backfill [${mode}] ===\n`);
  if (!execute) {
    console.log("(dry run — no uploads, no inserts. Pass --execute to perform the migration.)\n");
  }

  const db = createClient(supabaseUrl, serviceKey);

  let scanned = 0;
  let migrated = 0;        // would-migrate in dry run; actually migrated in execute
  let alreadyMigrated = 0;
  let missingSource = 0;
  const failures: Failure[] = [];

  let offset = 0;
  // Paginate deterministically (stable order) so the run is resumable.
  while (true) {
    const { data, error } = await db
      .from("nw_deal_confirmations")
      .select("id, confirmation_number, client_id, employee_id, accepted_at, signed_pdf_path, client:nw_clients(client_code)")
      .eq("acceptance_status", "accepted")
      .not("signed_pdf_path", "is", null)
      .order("created_at", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      console.error("FATAL: could not read nw_deal_confirmations:", error.message);
      Deno.exit(1);
    }
    const rows = (data as unknown as DealRow[]) ?? [];
    if (rows.length === 0) break;

    for (const deal of rows) {
      scanned++;
      try {
        const clientCode = deal.client?.client_code;
        if (!clientCode) {
          failures.push({ deal_id: deal.id, confirmation_number: deal.confirmation_number, reason: "missing client_code" });
          continue;
        }
        const destPath = vaultPathFor(clientCode, deal.confirmation_number);

        // (3) Idempotency guard — skip if already present (no download/upload/insert).
        const { data: existing, error: existErr } = await db
          .from("nw_documents").select("id").eq("file_path", destPath).maybeSingle();
        if (existErr) {
          failures.push({ deal_id: deal.id, confirmation_number: deal.confirmation_number, reason: `existence check failed: ${existErr.message}` });
          continue;
        }
        if (existing) { alreadyMigrated++; continue; }

        // (4) Read the signed PDF from deal-documents (authoritative pointer).
        const { data: blob, error: dlErr } = await db.storage
          .from(SOURCE_BUCKET).download(deal.signed_pdf_path!);
        if (dlErr || !blob) {
          missingSource++;
          failures.push({ deal_id: deal.id, confirmation_number: deal.confirmation_number, reason: `source PDF missing (${deal.signed_pdf_path}): ${dlErr?.message ?? "no data"}` });
          continue;
        }
        const bytes = new Uint8Array(await blob.arrayBuffer());

        if (!execute) { migrated++; continue; } // dry run: would migrate

        // Upload into crm-documents; verify success BEFORE inserting the row.
        const up = await db.storage.from(VAULT_BUCKET)
          .upload(destPath, bytes, { contentType: "application/pdf", upsert: true });
        if (up.error) {
          failures.push({ deal_id: deal.id, confirmation_number: deal.confirmation_number, reason: `upload failed: ${up.error.message}` });
          continue; // never insert the row if the upload failed
        }

        // Insert nw_documents (metadata consistent with Sprint 6A; uploaded_at
        // preserves the original signing time).
        const ins = await db.from("nw_documents").insert({
          client_id: deal.client_id,
          employee_id: deal.employee_id,
          document_type: "DEAL_CONFIRMATION",
          file_name: fileNameFor(deal.confirmation_number),
          file_path: destPath,
          file_size: bytes.length,
          mime_type: "application/pdf",
          uploaded_by_name: UPLOADED_BY_NAME,
          uploaded_at: deal.accepted_at ?? new Date().toISOString(),
        });
        if (ins.error) {
          // File is in the vault (upsert) but the row failed; a re-run will
          // find no row for this file_path and safely retry the insert.
          failures.push({ deal_id: deal.id, confirmation_number: deal.confirmation_number, reason: `insert failed: ${ins.error.message}` });
          continue;
        }
        migrated++;
      } catch (e) {
        failures.push({ deal_id: deal.id, confirmation_number: deal.confirmation_number, reason: `unexpected: ${e instanceof Error ? e.message : String(e)}` });
      }
    }

    if (rows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  // Completion summary
  console.log("\n----------------------------------------------------------");
  console.log("Completion Summary");
  console.log("----------------------------------------------------------");
  console.log(`Total scanned      : ${scanned}`);
  console.log(`${execute ? "Migrated" : "Would migrate"}       : ${migrated}`);
  console.log(`Already migrated   : ${alreadyMigrated}`);
  console.log(`Missing source PDF : ${missingSource}`);
  console.log(`Failed             : ${failures.length}`);
  if (failures.length > 0) {
    console.log("\nFailures:");
    for (const f of failures) {
      console.log(`  - ${f.confirmation_number} (${f.deal_id}): ${f.reason}`);
    }
  }
  console.log("----------------------------------------------------------\n");
  if (!execute) {
    console.log("DRY RUN complete. Re-run with --execute to perform the migration.\n");
  } else {
    console.log("EXECUTE complete. Safe to re-run — already-migrated deals are skipped.\n");
  }
}

main().catch((e) => {
  console.error("FATAL:", e instanceof Error ? e.message : String(e));
  Deno.exit(1);
});
