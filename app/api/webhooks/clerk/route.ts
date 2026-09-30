/**
 * app/api/webhooks/clerk/route.ts
 *
 * Clerk → Supabase user synchronisation webhook.
 *
 * ─── Purpose ────────────────────────────────────────────────────────────────
 * Keeps the Supabase `profiles` table in sync with Clerk user events.
 * Clerk is the source of truth for identity. This handler is the bridge.
 *
 * ─── Security ───────────────────────────────────────────────────────────────
 * Every request is verified with the Standard Webhooks HMAC signature before
 * any side-effects run. An invalid signature returns HTTP 400. The body is
 * never parsed before verification.
 *
 * The signing secret is read from CLERK_WEBHOOK_SIGNING_SECRET (set this in
 * your Clerk Dashboard → Webhooks → [endpoint] → Signing Secret).
 *
 * ─── Idempotency ────────────────────────────────────────────────────────────
 * All writes use upsert keyed on `clerk_user_id`. Replayed or duplicated
 * deliveries are safe and produce no duplicate records.
 *
 * ─── Error taxonomy ─────────────────────────────────────────────────────────
 *   400 – malformed body or signature verification failure
 *   500 – internal/database error after successful verification
 *   200 – success (including unhandled event types, which are acknowledged)
 *
 * ─── Events handled ─────────────────────────────────────────────────────────
 *   user.created  → upsert profile row
 *   user.updated  → upsert profile row (same operation; idempotent)
 *   user.deleted  → anonymise PII columns (retain row for FK integrity)
 *
 * ─── Eventual consistency assumption ────────────────────────────────────────
 * Clerk webhooks are delivered at-least-once with no strong ordering guarantee.
 * An `updated_at` check is NOT performed because out-of-order events for
 * separate fields are extremely rare and idempotency is more important than
 * strict ordering in this context.
 */

import { verifyWebhook } from "@clerk/nextjs/webhooks";
import type { WebhookEvent } from "@clerk/nextjs/webhooks";
import { type NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

// Opt out of response body caching so the raw request body is readable.
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  // ── 1. Verify webhook signature ─────────────────────────────────────────
  // verifyWebhook reads CLERK_WEBHOOK_SIGNING_SECRET from env automatically.
  // It throws with a descriptive message if the signature is invalid or the
  // signing secret is missing.
  let event: WebhookEvent;
  try {
    event = await verifyWebhook(req);
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Webhook signature verification failed";

    // Log the raw reason server-side only; never expose it in the response
    // body as it may reveal timing or structural information.
    console.error("[webhook/clerk] Signature verification failed:", message);

    return NextResponse.json(
      { error: "Invalid webhook signature" },
      { status: 400 }
    );
  }

  const { type } = event;

  // ── 2. Dispatch event ────────────────────────────────────────────────────
  try {
    const supabase = createSupabaseServiceClient();

    // ── user.created / user.updated ────────────────────────────────────────
    if (type === "user.created" || type === "user.updated") {
      const user = event.data;

      // Resolve the primary email address from the nested array.
      const primaryEmail =
        user.email_addresses.find(
          (e) => e.id === user.primary_email_address_id
        )?.email_address ?? null;

      const { error } = await supabase.from("profiles").upsert(
        {
          clerk_user_id: user.id,
          email: primaryEmail,
          first_name: user.first_name ?? null,
          last_name: user.last_name ?? null,
          avatar_url: user.image_url || null,
          // `updated_at` is managed by the DB trigger; explicit here for safety
          // on platforms that do not run triggers on upsert.
          updated_at: new Date().toISOString(),
        },
        {
          // Conflict target: the UNIQUE constraint on clerk_user_id.
          onConflict: "clerk_user_id",
          // Always update; not ignoreDuplicates.
          ignoreDuplicates: false,
        }
      );

      if (error) {
        console.error(
          `[webhook/clerk] DB upsert failed for ${user.id} (${type}):`,
          error.message
        );
        return NextResponse.json(
          { error: "Profile sync failed" },
          { status: 500 }
        );
      }

      console.log(
        `[webhook/clerk] Profile synced — userId=${user.id} event=${type}`
      );
      return NextResponse.json({ received: true });
    }

    // ── user.deleted ───────────────────────────────────────────────────────
    if (type === "user.deleted") {
      const { id, deleted } = event.data;

      // Clerk sends a tombstone for soft-deletions too; skip unless confirmed.
      if (!deleted || !id) {
        console.log(
          "[webhook/clerk] user.deleted received but not confirmed; skipping"
        );
        return NextResponse.json({ received: true });
      }

      // Anonymise PII instead of hard-deleting.
      //
      // Assumption: profile rows are retained so that FK references from
      // rentals, payments, and inspection records remain valid, preserving
      // historical data integrity. If hard-delete is required by a future data-
      // retention policy, cascade behaviour must be reviewed first.
      const { error } = await supabase
        .from("profiles")
        .update({
          email: null,
          first_name: null,
          last_name: null,
          avatar_url: null,
          updated_at: new Date().toISOString(),
        })
        .eq("clerk_user_id", id);

      if (error) {
        console.error(
          `[webhook/clerk] DB anonymise failed for ${id}:`,
          error.message
        );
        return NextResponse.json(
          { error: "Profile anonymisation failed" },
          { status: 500 }
        );
      }

      console.log(
        `[webhook/clerk] Profile anonymised — userId=${id} event=user.deleted`
      );
      return NextResponse.json({ received: true });
    }

    // ── Unhandled event types ──────────────────────────────────────────────
    // Acknowledged with 200 so Clerk does not retry. Unsubscribe events that
    // are not needed in the Clerk Dashboard to reduce noise.
    console.log(`[webhook/clerk] Unhandled event type acknowledged: ${type}`);
    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("[webhook/clerk] Unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
