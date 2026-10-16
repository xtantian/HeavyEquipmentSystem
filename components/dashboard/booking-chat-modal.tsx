"use client";

import * as React from "react";
import Link from "next/link";
import { MessageSquare, Send, Loader2, X, AlertCircle, ExternalLink } from "lucide-react";
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

interface BookingChatModalProps {
  bookingId: string;
  listingTitle: string;
  isOpen: boolean;
  onClose: () => void;
  currentUserId: string;
}

export function BookingChatModal({
  bookingId,
  listingTitle,
  isOpen,
  onClose,
  currentUserId,
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-200">
      <Card className="relative flex h-[600px] max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/80 px-6 py-4 bg-muted/30">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <MessageSquare className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-heading text-base font-bold text-foreground line-clamp-1">
                  {listingTitle}
                </h3>
                <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-500/30">
                  Confirmed Booking
                </Badge>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                {otherParticipant ? (
                  <Link
                    href={`/profile/${otherParticipant.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
                  >
                    <span>Participant: {otherParticipant.name}</span>
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                ) : (
                  <p className="text-xs text-muted-foreground font-mono">
                    Booking ID: {bookingId.slice(0, 8)}...
                  </p>
                )}
              </div>
            </div>
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

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
  );
}
