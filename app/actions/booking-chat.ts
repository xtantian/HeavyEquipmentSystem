"use server";

import { auth } from "@clerk/nextjs/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface BookingMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  read_at: string | null;
  created_at: string;
}

export interface ConversationDetails {
  id: string;
  booking_id: string;
  renter_id: string;
  owner_id: string;
  created_at: string;
}

export interface GetConversationResult {
  success: boolean;
  conversation?: ConversationDetails;
  messages?: BookingMessage[];
  otherParticipantId?: string;
  otherParticipantName?: string;
  error?: string;
  code?: string;
}

export interface SendMessageResult {
  success: boolean;
  message?: BookingMessage;
  error?: string;
  code?: string;
}

/**
 * Authoritative Server Action to retrieve or initialize a booking conversation.
 * Calls RPC `public.get_or_create_booking_conversation(p_booking_id)`.
 * Unlocks strictly for accepted/active rentals where caller is participant or admin.
 */
export async function getBookingConversationAction(
  bookingId: string
): Promise<GetConversationResult> {
  const { userId } = await auth();
  if (!userId) {
    return {
      success: false,
      error: "You must be signed in to access booking messages.",
      code: "AUTH_REQUIRED",
    };
  }

  if (!bookingId) {
    return {
      success: false,
      error: "A valid booking ID is required.",
      code: "INVALID_INPUT",
    };
  }

  try {
    const supabase = await createSupabaseServerClient();

    // 1. Authoritative RPC call to get or create the conversation
    const { data: convData, error: convError } = await supabase.rpc(
      "get_or_create_booking_conversation",
      { p_booking_id: bookingId }
    );

    if (convError || !convData) {
      console.warn("[getBookingConversationAction] RPC Error:", {
        bookingId,
        code: convError?.code,
        message: convError?.message,
      });

      if (convError?.code === "42501") {
        return {
          success: false,
          error: convError.message || "Messaging is only unlocked for accepted rental transactions.",
          code: "42501",
        };
      }

      return {
        success: false,
        error: convError?.message || "Failed to load conversation.",
        code: convError?.code || "ERROR",
      };
    }

    const conversation = convData as unknown as ConversationDetails;

    // 2. Resolve counterparty details for safe profile navigation
    const otherParticipantId =
      conversation.renter_id === userId ? conversation.owner_id : conversation.renter_id;
    let otherParticipantName =
      conversation.renter_id === userId ? "Equipment Host" : "Verified Renter";

    if (otherParticipantId) {
      const { data: otherProfile } = await supabase
        .from("profiles")
        .select("first_name, last_name")
        .eq("clerk_user_id", otherParticipantId)
        .maybeSingle();

      if (otherProfile) {
        const full = [otherProfile.first_name, otherProfile.last_name]
          .filter(Boolean)
          .join(" ")
          .trim();
        if (full) otherParticipantName = full;
      }
    }

    // 3. Fetch messages in chronological order
    const { data: messagesData, error: messagesError } = await supabase
      .from("messages")
      .select("id, conversation_id, sender_id, content, read_at, created_at")
      .eq("conversation_id", conversation.id)
      .order("created_at", { ascending: true });

    if (messagesError) {
      console.error("[getBookingConversationAction] Fetch messages error:", messagesError.message);
      return {
        success: true,
        conversation,
        messages: [],
        otherParticipantId,
        otherParticipantName,
      };
    }

    return {
      success: true,
      conversation,
      messages: (messagesData || []) as BookingMessage[],
      otherParticipantId,
      otherParticipantName,
    };
  } catch (err: unknown) {
    console.error("[getBookingConversationAction] Unexpected exception:", err);
    return {
      success: false,
      error: "An unexpected error occurred while loading messages.",
      code: "ERROR",
    };
  }
}

/**
 * Authoritative Server Action to post a new message to a booking conversation.
 * Respects RLS and message immutability triggers.
 */
export async function sendBookingMessageAction(
  conversationId: string,
  content: string
): Promise<SendMessageResult> {
  const { userId } = await auth();
  if (!userId) {
    return {
      success: false,
      error: "You must be signed in to send messages.",
      code: "AUTH_REQUIRED",
    };
  }

  const trimmed = (content || "").trim();
  if (!trimmed) {
    return {
      success: false,
      error: "Message content cannot be empty.",
      code: "INVALID_INPUT",
    };
  }

  if (trimmed.length > 5000) {
    return {
      success: false,
      error: "Message exceeds maximum length of 5000 characters.",
      code: "INVALID_INPUT",
    };
  }

  try {
    const supabase = await createSupabaseServerClient();

    const { data: inserted, error: insertError } = await supabase
      .from("messages")
      .insert({
        conversation_id: conversationId,
        sender_id: userId,
        content: trimmed,
      })
      .select("id, conversation_id, sender_id, content, read_at, created_at")
      .single();

    if (insertError || !inserted) {
      console.error("[sendBookingMessageAction] Insert error:", insertError?.message);
      return {
        success: false,
        error: insertError?.message || "Failed to send message.",
        code: insertError?.code || "ERROR",
      };
    }

    return {
      success: true,
      message: inserted as BookingMessage,
    };
  } catch (err: unknown) {
    console.error("[sendBookingMessageAction] Unexpected exception:", err);
    return {
      success: false,
      error: "An unexpected error occurred while sending your message.",
      code: "ERROR",
    };
  }
}
