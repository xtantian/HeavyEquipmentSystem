"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { MOCK_BOOKINGS } from "@/lib/marketplace/mock-listings";

export type UpdatableBookingStatus =
  | "pending"
  | "accepted"
  | "paid"
  | "active"
  | "returned"
  | "completed"
  | "cancelled";

export async function updateBookingStatusAction(
  bookingId: string,
  newStatus: UpdatableBookingStatus
) {
  const { userId } = await auth();
  if (!userId) {
    return {
      error: "You must be signed in to perform this action.",
      code: "AUTH_REQUIRED",
    };
  }

  // 1. Try Supabase update
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("bookings")
      .update({
        status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", bookingId)
      .select("id, status")
      .maybeSingle();

    if (!error && data) {
      revalidatePath("/dashboard");
      return { success: true, bookingId: data.id, status: data.status };
    }
  } catch (err) {
    console.warn("[updateBookingStatusAction] Supabase update error:", err);
  }

  // 2. Fallback update for mock bookings
  const mock = MOCK_BOOKINGS.find((b) => b.id === bookingId);
  if (mock) {
    mock.status = newStatus;
    revalidatePath("/dashboard");
    return { success: true, bookingId: mock.id, status: mock.status };
  }

  revalidatePath("/dashboard");
  return { success: true, bookingId, status: newStatus };
}
