export type ConnectionStatus = "connecting" | "connected" | "disconnected" | "reconnecting";

export interface EmailMessage {
  id: string;
  subject: string;
  sender: string;
  senderEmail?: string;
  timestamp: string; // ISO
  account: string;
  preview?: string;
}