/**
 * Sprint 6B.1 — Historical DSA Debit Note Backfill (ONE-TIME utility)
 * ---------------------------------------------------------------------------
 * Standalone Deno script. NOT part of the CRM runtime, NOT an Edge Function.
 * Run manually by an admin with service-role credentials.
 *
 * Sprint 6B auto-files the signed DSA Debit Note into every mapped client's
 * "DSA Documents" vault folder for NEW signings. This utility back-files the
 * same for HISTORICAL signed debit notes.
 *
 * For every signed debit note, for every client mapped to its DSA
 * (nw_clients.dsa_id), it copies the signed PDF from the authoritative
 * `dsa-debit-notes` bucket into the client's `crm-documents` vault under the
 * DSA_DOCUMENTS folder and inserts the matching nw_documents row.
 *
 * Guarantees:
 *   • Idempotent / retry-safe / resumable — skips (client, note) pairs already
 *     filed (by the deterministic vault file_path, identical to Sprint 6B).
 *   • Read-only against dsa_debit_notes / nw_clients / dsa-debit-notes (source of
 *     truth never modified). The only writes are: upload into crm-documents and
 *     insert into nw_documents. The DB row is inserted ONLY after a verified
 *     successful upload. Nothing is ever deleted.
 *   • Per-client try/catch; per-debit-note continue-on-error — one failure never
 *     stops the run; all failures are collected and reported.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     deno run --allow-net --allow-env scripts/backfill-historical-dsa-debit-notes.ts           # DRY RUN (default)
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     deno run --allow-net --allow-env scripts/backfill-historical-dsa-debit-notes.ts --execute  # PERFORM
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const SOURCE_BUCKET = "dsa-debit-notes";
const VAULT_BUCKET = "crm-documents";
const PAGE_SIZE = 100;
const UPLOADED_BY_NAME = "Historical DSA debit note (backfill)";

// Deterministic destination path — MUST stay identical to Sprint 6B so the two
// are mutually idempotent.
function vaultPathFor(clientCode: string, debitNoteNumber: string): string {
  return `clients/${clientCode}/DSA_DOCUMENTS/Signed_DSA_Debit_Note_${debitNoteNumber}.pdf`;
}
function fileNameFor(debitNoteNumber: string): string {
  return `Signed_DSA_Debit_Note_${debitNoteNumber}.pdf`;
}

interface NoteRow {
  id: string;
  debit_note_number: string;
  dsa_id: string | null;
  signed_pdf_url: string | null;
  signed_at: string | null;
}
interface ClientRow {
  id: string;
  client_code: string | null;
  employee_id: string | null;
}
interface Failure {
  debit_note_number: string;
  client_id: string;
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
  console.log(`\n=== Sprint 6B.1 — Historical DSA Debit Note Backfill [${mode}] ===\n`);
  if (!execute) {
    console.log("(dry run — no uploads, no inserts. Pass --execute to perform the migration.)\n");
  }

  const db = createClient(supabaseUrl, serviceKey);

  let notesScanned = 0;
  let clientsProcessed = 0;
  let migrated = 0;          // would-migrate in dry run; actually migrated in execute
  let alreadyMigrated = 0;
  let missingSource = 0;     // counted per note whose source PDF could not be read
  const failures: Failure[] = [];

  let offset = 0;
  while (true) {
    const { data, error } = await db
      .from("dsa_debit_notes")
      .select("id, debit_note_number, dsa_id, signed_pdf_url, signed_at")
      .eq("signature_status", "signed")
      .not("signed_pdf_url", "is", null)
      .order("created_at", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      console.error("FATAL: could not read dsa_debit_notes:", error.message);
      Deno.exit(1);
    }
    const notes = (data as NoteRow[]) ?? [];
    if (notes.length === 0) break;

    for (const note of notes) {
      notesScanned++;
      try {
        if (!note.dsa_id) continue; // no DSA → no clients to file for

        const { data: clientData } = await db.from("nw_clients")
          .select("id, client_code, employee_id").eq("dsa_id", note.dsa_id);
        const clients = (clientData as ClientRow[]) ?? [];

        // The signed PDF is shared across all this note's clients; download it at
        // most once, lazily (only when a client actually needs it).
        let sourceBytes: Uint8Array | null = null;
        let sourceState: "unknown" | "ok" | "missing" = "unknown";

        for (const client of clients) {
          clientsProcessed++;
          try {
            if (!client.client_code) {
              failures.push({ debit_note_number: note.debit_note_number, client_id: client.id, reason: "missing client_code" });
              continue;
            }
            const destPath = vaultPathFor(client.client_code, note.debit_note_number);

            // Idempotency guard — skip if already filed for this client.
            const { data: existing, error: existErr } = await db
              .from("nw_documents").select("id").eq("file_path", destPath).maybeSingle();
            if (existErr) {
              failures.push({ debit_note_number: note.debit_note_number, client_id: client.id, reason: `existence check failed: ${existErr.message}` });
              continue;
            }
            if (existing) { alreadyMigrated++; continue; }

            // This client needs filing → ensure the source PDF is available.
            if (sourceState === "unknown") {
              const dl = await db.storage.from(SOURCE_BUCKET).download(note.signed_pdf_url!);
              if (dl.error || !dl.data) {
                sourceState = "missing";
                missingSource++; // counted once per note
                console.error(`source PDF missing for ${note.debit_note_number} (${note.signed_pdf_url}): ${dl.error?.message ?? "no data"}`);
              } else {
                sourceBytes = new Uint8Array(await dl.data.arrayBuffer());
                sourceState = "ok";
              }
            }
            if (sourceState === "missing") continue; // note-level source gap; skip its clients

            if (!execute) { migrated++; continue; } // dry run: would migrate

            // Upload first; verify success BEFORE inserting the row.
            const up = await db.storage.from(VAULT_BUCKET)
              .upload(destPath, sourceBytes!, { contentType: "application/pdf", upsert: true });
            if (up.error) {
              failures.push({ debit_note_number: note.debit_note_number, client_id: client.id, reason: `upload failed: ${up.error.message}` });
              continue; // never insert the row if the upload failed
            }

            const ins = await db.from("nw_documents").insert({
              client_id: client.id,
              employee_id: client.employee_id,
              document_type: "DSA_DOCUMENTS",
              file_name: fileNameFor(note.debit_note_number),
              file_path: destPath,
              file_size: sourceBytes!.length,
              mime_type: "application/pdf",
              uploaded_by_name: UPLOADED_BY_NAME,
              uploaded_at: note.signed_at ?? new Date().toISOString(),
            });
            if (ins.error) {
              // File is in the vault (upsert) but the row failed; a re-run finds
              // no row for this file_path and safely retries the insert.
              failures.push({ debit_note_number: note.debit_note_number, client_id: client.id, reason: `insert failed: ${ins.error.message}` });
              continue;
            }
            migrated++;
          } catch (perClientErr) {
            failures.push({ debit_note_number: note.debit_note_number, client_id: client.id, reason: `unexpected: ${perClientErr instanceof Error ? perClientErr.message : String(perClientErr)}` });
          }
        }
      } catch (perNoteErr) {
        // per-debit-note continue-on-error
        console.error(`debit note ${note.debit_note_number} failed: ${perNoteErr instanceof Error ? perNoteErr.message : String(perNoteErr)}`);
      }
    }

    if (notes.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  // Completion summary
  console.log("\n------------------------------------");
  console.log(`Total signed debit notes scanned : ${notesScanned}`);
  console.log(`Clients processed                : ${clientsProcessed}`);
  console.log(`${execute ? "Documents migrated" : "Documents would migrate"}      : ${migrated}`);
  console.log(`Already migrated                 : ${alreadyMigrated}`);
  console.log(`Missing source PDFs              : ${missingSource}`);
  console.log(`Failed                           : ${failures.length}`);
  console.log("------------------------------------");
  if (failures.length > 0) {
    console.log("\nFailures:");
    for (const f of failures) {
      console.log(`  - ${f.debit_note_number} / client ${f.client_id}: ${f.reason}`);
    }
  }
  console.log(!execute
    ? "\nDRY RUN complete. Re-run with --execute to perform the migration.\n"
    : "\nEXECUTE complete. Safe to re-run — already-migrated pairs are skipped.\n");
}

main().catch((e) => {
  console.error("FATAL:", e instanceof Error ? e.message : String(e));
  Deno.exit(1);
});
