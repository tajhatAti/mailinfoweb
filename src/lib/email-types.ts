export type ConnectionStatus = "connecting" | "connected" | "disconnected" | "reconnecting";

export interface EmailMessage {
  id: string;
  uid?: string;
  subject: string;
  sender: string;
  senderEmail?: string;
  timestamp: string;
  account: string;
  preview?: string;
}

export interface BlockedSender {
  senderEmail: string;
  blockedAt: string;
}
