import { redirect } from "next/navigation";
import { conversationHref } from "@/lib/conversation-intent";

export default function RegistrarPage() {
  redirect(conversationHref("register_event"));
}
