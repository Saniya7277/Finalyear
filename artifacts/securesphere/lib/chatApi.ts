import { useAuthenticatedApi } from "./authenticatedApi";

export interface ChatConversation { id: string; participantOneId: string; participantTwoId: string; }
export interface EncryptedMessage {
  id: string; conversationId: string; senderId: string; recipientId: string;
  ciphertext: string; iv: string; encryptionAlgorithm: "AES-256-GCM";
  senderWrappedMessageKey: string; senderWrappingIv: string;
  recipientWrappedMessageKey: string; recipientWrappingIv: string;
  wrappingAlgorithm: "ECDH-P256/HKDF-SHA256/AES-256-GCM";
  senderDeviceKeyId: string; recipientDeviceKeyId: string; createdAt: string;
  deviceWrappedMessageKey?: string; deviceWrappingIv?: string; deviceKeyId?: string;
}

export interface RecipientMessageKey { recipientDeviceKeyId: string; wrappedMessageKey: string; wrappingIv: string; }

export function useChatApi() {
  const { request } = useAuthenticatedApi();
  const openConversation = async (teammateId: string): Promise<ChatConversation> => {
    const response = await request("/api/chat/conversations", { method: "POST", body: JSON.stringify({ teammateId }) });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Could not open secure conversation.");
    return body.conversation;
  };
  const listMessages = async (conversationId: string, deviceKeyId: string): Promise<EncryptedMessage[]> => {
    const response = await request(`/api/chat/conversations/${conversationId}/messages?deviceKeyId=${encodeURIComponent(deviceKeyId)}`);
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Could not load encrypted messages.");
    return body.messages ?? [];
  };
  const sendMessage = async (conversationId: string, payload: Omit<EncryptedMessage, "id" | "conversationId" | "senderId" | "recipientId" | "createdAt" | "recipientWrappedMessageKey" | "recipientWrappingIv" | "recipientDeviceKeyId" | "deviceWrappedMessageKey" | "deviceWrappingIv" | "deviceKeyId"> & { senderDeviceKeys: RecipientMessageKey[]; recipientDeviceKeys: RecipientMessageKey[] }) => {
    const response = await request(`/api/chat/conversations/${conversationId}/messages`, { method: "POST", body: JSON.stringify(payload) });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Could not send secure message.");
    return body.message as EncryptedMessage;
  };
  return { openConversation, listMessages, sendMessage };
}
