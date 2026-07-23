import { AppShell } from "@/components/AppShell";

export default function UserLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
