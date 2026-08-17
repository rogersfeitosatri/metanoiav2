import { redirect } from "next/navigation";

// A Conversa vive em /app/hoje (ConversationHome).
export default function Page() {
  redirect("/app/hoje");
}
