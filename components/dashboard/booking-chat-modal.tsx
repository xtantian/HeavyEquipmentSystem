"use client";

import * as React from "react";
import Link from "next/link";
import { MessageSquare, Send, Loader2, X, AlertCircle, ExternalLink, CheckCircle2, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  getBookingConversationAction,
  sendBookingMessageAction,
  type BookingMessage,
  type ConversationDetails,
} from "@/app/actions/booking-chat";
import { completeBookingAction } from "@/app/dashboard/actions";
import { WriteListerReviewModal } from "@/components/reviews/write-lister-review-modal";

interface BookingChatModalProps {
  bookingId: string;
  listingTitle: string;
  isOpen: boolean;
  onClose: () => void;
  currentUserId: string;
  onBookingCompleted?: (bookingId: string) => void;
}

export function BookingChatModal({
  bookingId,
  listingTitle,
  isOpen,
  onClose,
  currentUserId,
  onBookingCompleted,
}: BookingChatModalProps) {
  const [conversation, setConversation] = React.useState<ConversationDetails | null>(null);
  const [messages, setMessages] = React.useState<BookingMessage[]>([]);
  const [otherParticipant, setOtherParticipant] = React.useState<{
    id: string;
    name: string;
  } | null>(null);
  const [newMessage, setNewMessage] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSending, setIsSending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [bookingStatus, setBookingStatus] = React.useState<string>("accepted");
  const [isRenter, setIsRenter] = React.useState<boolean>(false);
  const [isOwner, setIsOwner] = React.useState<boolean>(false);
  const [hasReviewed, setHasReviewed] = React.useState<boolean>(false);
  const [isConfirmingDone, setIsConfirmingDone] = React.useState<boolean>(false);
  const [isCompleting, setIsCompleting] = React.useState<boolean>(false);
  const [isReviewModalOpen, setIsReviewModalOpen] = React.useState<boolean>(false);
  const [completionNotice, setCompletionNotice] = React.useState<string | null>(null);
  const messagesEndRef = React.useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  React.useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;

    getBookingConversationAction(bookingId)
      .then((res) => {
        if (!isMounted) return;
        if (!res.success) {
          setError(res.error || "Failed to load conversation.");
        } else {
          setConversation(res.conversation || null);
          setMessages(res.messages || []);
          if (res.bookingStatus) setBookingStatus(res.bookingStatus);
          if (res.isRenter !== undefined) setIsRenter(res.isRenter);
          if (res.isOwner !== undefined) setIsOwner(res.isOwner);
          if (res.hasReviewed !== undefined) setHasReviewed(res.hasReviewed);
          if (res.otherParticipantId && res.otherParticipantName) {
            setOtherParticipant({
              id: res.otherParticipantId,
              name: res.otherParticipantName,
            });
          }
        }
      })
      .catch((err) => {
        if (isMounted) setError((err as Error).message || "An unexpected error occurred.");
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [bookingId, isOpen]);

  React.useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !conversation?.id || isSending) return;

    const contentToSend = newMessage.trim();
    setIsSending(true);
    setError(null);

    try {
      const res = await sendBookingMessageAction(conversation.id, contentToSend);
      if (!res.success) {
        setError(res.error || "Failed to send message.");
      } else if (res.message) {
        setMessages((prev) => [...prev, res.message!]);
        setNewMessage("");
      }
    } catch (err) {
      setError((err as Error).message || "Failed to send message.");
    } finally {
      setIsSending(false);
    }
  };

  const handleConfirmMarkDone = async () => {
    setIsCompleting(true);
    setError(null);
    try {
      const res = await completeBookingAction(bookingId);
      if (!res.success) {
        setError(res.error || "Failed to complete rental transaction.");
      } else {
        setBookingStatus("completed");
        setIsConfirmingDone(false);
        setCompletionNotice("Rental transaction marked as completed!");
        onBookingCompleted?.(bookingId);

        // Immediately unlock review for the renter
        if (res.isRenter || isRenter) {
          setIsReviewModalOpen(true);
        }
      }
    } catch (err) {
      setError((err as Error).message || "An unexpected error occurred.");
    } finally {
      setIsCompleting(false);
    }
  };

  if (!isOpen) return null;

  const canMarkAsDone = bookingStatus !== "completed" && bookingStatus !== "cancelled";

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-200">
        <Card className="relative flex h-[600px] max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border/80 px-6 py-4 bg-muted/30">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <MessageSquare className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-heading text-base font-bold text-foreground truncate max-w-[200px] sm:max-w-[260px]">
                    {listingTitle}
                  </h3>
                  {bookingStatus === "completed" ? (
                    <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/30 shrink-0">
                      Completed
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-500/30 shrink-0">
                      Confirmed
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  {otherParticipant ? (
                    <Link
                      href={`/profile/${otherParticipant.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
                    >
                      <span className="truncate">Participant: {otherParticipant.name}</span>
                      <ExternalLink className="h-3 w-3 shrink-0" />
                    </Link>
                  ) : (
                    <p className="text-xs text-muted-foreground font-mono">
                      Booking ID: {bookingId.slice(0, 8)}...
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {/* Mark as Done action button for either renter or lister */}
              {canMarkAsDone && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setIsConfirmingDone(true)}
                  className="h-8 px-2.5 text-xs font-semibold border-emerald-600/40 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/10 cursor-pointer"
                >
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                  Mark as Done
                </Button>
              )}

              {/* Renter review host button once booking is completed */}
              {bookingStatus === "completed" && isRenter && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setIsReviewModalOpen(true)}
                  disabled={hasReviewed}
                  className="h-8 px-2.5 text-xs font-semibold border-primary/40 text-primary hover:bg-primary/10 cursor-pointer"
                >
                  <Star className="h-3.5 w-3.5 mr-1 fill-primary/30" />
                  {hasReviewed ? "Reviewed" : "Review Host"}
                </Button>
              )}

              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Completion banner notification if just completed */}
          {completionNotice && (
            <div className="flex items-center justify-between px-6 py-2 bg-emerald-500/10 border-b border-emerald-500/20 text-xs text-emerald-700 dark:text-emerald-300">
              <span className="flex items-center gap-1.5 font-medium">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                {completionNotice}
              </span>
              <button
                type="button"
                onClick={() => setCompletionNotice(null)}
                className="text-emerald-700/60 hover:text-emerald-700 font-bold ml-2 cursor-pointer"
              >
                ✕
              </button>
            </div>
          )}

        {/* Message Viewport */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {isLoading ? (
            <div className="flex h-full flex-col items-center justify-center text-muted-foreground gap-2">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <span className="text-xs">Loading secure channel...</span>
            </div>
          ) : error ? (
            <div className="flex h-full flex-col items-center justify-center text-center p-6 text-destructive gap-2">
              <AlertCircle className="h-8 w-8" />
              <p className="text-sm font-semibold">{error}</p>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground gap-2">
              <MessageSquare className="h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm font-semibold text-foreground">No messages yet</p>
              <p className="text-xs max-w-xs text-muted-foreground">
                Coordinate pickup dates, site directions, or handover arrangements safely here.
              </p>
            </div>
          ) : (
            messages.map((msg) => {
              const isMe = msg.sender_id === currentUserId;
              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
                      isMe
                        ? "bg-primary text-primary-foreground rounded-br-xs"
                        : "bg-muted text-foreground rounded-bl-xs border border-border/60"
                    }`}
                  >
                    <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                  </div>
                  <span className="text-[10px] text-muted-foreground mt-1 px-1">
                    {new Date(msg.created_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Message Input Footer */}
        <form onSubmit={handleSendMessage} className="border-t border-border/80 p-4 bg-muted/20">
          <div className="flex items-end gap-2">
            <Textarea
              rows={1}
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder={isLoading || error ? "Messaging unavailable" : "Type a message..."}
              disabled={isLoading || Boolean(error) || isSending}
              className="min-h-[42px] max-h-24 resize-none rounded-xl bg-background text-sm"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage(e);
                }
              }}
            />
            <Button
              type="submit"
              size="icon"
              disabled={isLoading || Boolean(error) || isSending || !newMessage.trim()}
              className="h-[42px] w-[42px] shrink-0 rounded-xl cursor-pointer"
            >
              {isSending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </form>
      </Card>
    </div>

      {/* Confirmation Dialog: Mark as Done */}
      {isConfirmingDone && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs animate-in fade-in duration-200">
          <Card className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-emerald-600 dark:text-emerald-500">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-heading text-base font-bold text-foreground">
                  Mark Rental as Done?
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Single-party completion confirmation
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-border/60 bg-muted/30 p-3.5 text-xs text-muted-foreground space-y-2">
              <p className="font-semibold text-foreground">
                Transaction: {listingTitle}
              </p>
              <p>
                Confirming this action will immediately finalize the rental and mark the booking as <strong>completed</strong>.
              </p>
              <p className="text-foreground/80">
                No further approval or confirmation is required from the second party.
              </p>
              {isRenter && (
                <p className="text-emerald-700 dark:text-emerald-400 font-medium pt-1">
                  ★ You will immediately be able to leave a verified 1–5 star review with feedback for the host.
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isCompleting}
                onClick={() => setIsConfirmingDone(false)}
                className="text-xs font-semibold cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={isCompleting}
                onClick={handleConfirmMarkDone}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm cursor-pointer"
              >
                {isCompleting ? (
                  <>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    Completing...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                    Confirm & Mark Done
                  </>
                )}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Review Modal Dialog for Renter */}
      {isReviewModalOpen && (
        <WriteListerReviewModal
          bookingId={bookingId}
          listerName={otherParticipant?.name || "Equipment Host"}
          mode="lister"
          isOpen={true}
          onClose={() => setIsReviewModalOpen(false)}
          onSuccess={() => {
            setHasReviewed(true);
            setIsReviewModalOpen(false);
            setCompletionNotice("Thank you! Your verified review has been submitted.");
          }}
        />
      )}
    </>
  );
}
