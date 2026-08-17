import { redirect } from "next/navigation";

// Área reorganizada: a experiência central agora é a Conversa.
export default function Page() {
  redirect("/app/conversa");
}
