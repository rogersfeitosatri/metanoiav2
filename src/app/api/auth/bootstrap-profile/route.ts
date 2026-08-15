import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";
import { SUPABASE_URL, isSupabaseConfigured } from "@/lib/supabase/config";
import type { Role } from "@/lib/types";

function adminEmails() {
  return (process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

function roleFor(email: string | undefined): Role {
  if (email && adminEmails().includes(email.toLowerCase())) return "admin";
  return "user";
}

export async function POST() {
  if (!isSupabaseConfigured) {
    return NextResponse.json({ ok: false, error: "Supabase nao configurado." }, { status: 400 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "SUPABASE_SERVICE_ROLE_KEY nao configurada. Sem ela o app nao consegue criar o perfil apos o login.",
      },
      { status: 500 }
    );
  }

  const authClient = await createServerSupabase();
  const {
    data: { user },
    error: userError,
  } = authClient ? await authClient.auth.getUser() : { data: { user: null }, error: null };

  if (userError || !user) {
    return NextResponse.json({ ok: false, error: "Sessao nao encontrada." }, { status: 401 });
  }

  const adminClient = createClient(SUPABASE_URL, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const email = user.email || "";
  const metadataName =
    typeof user.user_metadata?.preferred_name === "string"
      ? user.user_metadata.preferred_name
      : typeof user.user_metadata?.full_name === "string"
        ? user.user_metadata.full_name
        : email.split("@")[0] || "Usuario";

  const { data: existing, error: readError } = await adminClient
    .from("profiles")
    .select("id, role, full_name, preferred_name")
    .eq("id", user.id)
    .maybeSingle();

  if (readError) {
    return NextResponse.json({ ok: false, error: readError.message }, { status: 500 });
  }

  const emailRole = roleFor(email);
  const role = emailRole === "admin" ? "admin" : ((existing?.role as Role | undefined) ?? "user");
  const now = new Date().toISOString();

  const writePayload = {
    role,
    full_name: existing?.full_name || metadataName,
    preferred_name: existing?.preferred_name || metadataName,
    email,
    timezone: "America/Sao_Paulo",
    onboarding_completed: role !== "user",
    updated_at: now,
  };

  const { error: upsertError } = existing
    ? await adminClient.from("profiles").update(writePayload).eq("id", user.id)
    : await adminClient.from("profiles").insert({
        id: user.id,
        ...writePayload,
        created_at: now,
      });

  if (upsertError) {
    return NextResponse.json({ ok: false, error: upsertError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, role });
}
