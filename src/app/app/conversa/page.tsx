import { redirect } from "next/navigation";
import { conversationHref } from "@/lib/conversation-intent";

export default function ConversaLegacyPage() {
  redirect(conversationHref("default"));
}
