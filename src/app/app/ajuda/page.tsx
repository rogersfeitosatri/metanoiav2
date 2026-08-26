import { redirect } from "next/navigation";
import { conversationHref } from "@/lib/conversation-intent";

export default function AjudaPage() {
  redirect(conversationHref("help_now"));
}
