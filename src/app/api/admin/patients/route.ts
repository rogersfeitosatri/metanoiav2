import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import { SUPABASE_URL, isSupabaseConfigured } from "@/lib/supabase/config";

const dateField = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const accessSchema = z
  .object({ accessStartsOn: dateField, accessEndsOn: dateField })
  .refine((data) => data.accessEndsOn >= data.accessStartsOn, {
    message: "A data final precisa ser igual ou posterior a data inicial.",
  });

const createPatientSchema = accessSchema.and(
  z.object({
    fullName: z.string().trim().min(2).max(120),
    email: z.string().trim().email().max(255),
    password: z.string().min(8).max(72),
  })
);

const updateAccessSchema = accessSchema.and(
  z.object({ patientId: z.string().uuid(), accessEnabled: z.boolean() })
);

const deletePatientSchema = z.object({
  patientId: z.string().uuid(),
  confirmation: z.literal("EXCLUIR"),
});

type AdminContext = { adminClient: SupabaseClient; adminId: string };

async function requireAdmin(): Promise<AdminContext | { response: NextResponse }> {
  if (!isSupabaseConfigured) {
    return { response: NextResponse.json({ error: "Supabase nao configurado." }, { status: 400 }) };
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return {
      response: NextResponse.json(
        { error: "A chave secreta do Supabase nao esta configurada." },
        { status: 500 }
      ),
    };
  }

  const authClient = await createServerSupabase();
  const {
    data: { user },
  } = authClient ? await authClient.auth.getUser() : { data: { user: null } };
  if (!user) {
    return { response: NextResponse.json({ error: "Sessao nao encontrada." }, { status: 401 }) };
  }

  const adminClient = createClient(SUPABASE_URL, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: profile, error } = await adminClient
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .maybeSingle();

  if (error || profile?.role !== "admin") {
    return { response: NextResponse.json({ error: "Acesso restrito ao administrador." }, { status: 403 }) };
  }

  return { adminClient, adminId: user.id };
}

function accessPeriod(startsOn: string, endsOn: string) {
  return {
    access_starts_at: new Date(`${startsOn}T00:00:00-03:00`).toISOString(),
    access_ends_at: new Date(`${endsOn}T23:59:59.999-03:00`).toISOString(),
  };
}

export async function POST(request: Request) {
  const context = await requireAdmin();
  if ("response" in context) return context.response;

  const parsed = createPatientSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Dados do paciente invalidos." },
      { status: 400 }
    );
  }

  const { fullName, email, password, accessStartsOn, accessEndsOn } = parsed.data;
  const normalizedEmail = email.toLowerCase();
  const { data: authData, error: authError } = await context.adminClient.auth.admin.createUser({
    email: normalizedEmail,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, preferred_name: fullName.split(" ")[0] },
  });

  if (authError || !authData.user) {
    const duplicate = /already|registered|exists/i.test(authError?.message || "");
    return NextResponse.json(
      { error: duplicate ? "Ja existe uma conta com este e-mail." : authError?.message || "Nao foi possivel criar o login." },
      { status: duplicate ? 409 : 400 }
    );
  }

  const now = new Date().toISOString();
  const { error: profileError } = await context.adminClient.from("profiles").insert({
    id: authData.user.id,
    role: "user",
    full_name: fullName,
    preferred_name: fullName.split(" ")[0],
    email: normalizedEmail,
    timezone: "America/Sao_Paulo",
    onboarding_completed: false,
    access_enabled: true,
    ...accessPeriod(accessStartsOn, accessEndsOn),
    created_at: now,
    updated_at: now,
  });

  if (profileError) {
    await context.adminClient.auth.admin.deleteUser(authData.user.id);
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  await context.adminClient.from("audit_logs").insert({
    actor_id: context.adminId,
    action: "create_patient_access",
    resource_type: "profile",
    resource_id: authData.user.id,
    metadata: { accessStartsOn, accessEndsOn },
  });

  return NextResponse.json({ ok: true, patientId: authData.user.id }, { status: 201 });
}

export async function PATCH(request: Request) {
  const context = await requireAdmin();
  if ("response" in context) return context.response;

  const parsed = updateAccessSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Periodo de acesso invalido." },
      { status: 400 }
    );
  }

  const { patientId, accessEnabled, accessStartsOn, accessEndsOn } = parsed.data;
  const { data: patient, error: patientError } = await context.adminClient
    .from("profiles")
    .select("id, role")
    .eq("id", patientId)
    .maybeSingle();
  if (patientError || patient?.role !== "user") {
    return NextResponse.json({ error: "Paciente nao encontrado." }, { status: 404 });
  }

  const { error } = await context.adminClient
    .from("profiles")
    .update({
      access_enabled: accessEnabled,
      ...accessPeriod(accessStartsOn, accessEndsOn),
      updated_at: new Date().toISOString(),
    })
    .eq("id", patientId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await context.adminClient.from("audit_logs").insert({
    actor_id: context.adminId,
    action: "update_patient_access",
    resource_type: "profile",
    resource_id: patientId,
    metadata: { accessEnabled, accessStartsOn, accessEndsOn },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const context = await requireAdmin();
  if ("response" in context) return context.response;

  const parsed = deletePatientSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Confirmação de exclusão inválida." }, { status: 400 });
  }

  const { patientId } = parsed.data;
  if (patientId === context.adminId) {
    return NextResponse.json({ error: "A conta administrativa não pode ser excluída por esta tela." }, { status: 400 });
  }

  const { data: patient, error: patientError } = await context.adminClient
    .from("profiles")
    .select("id, role")
    .eq("id", patientId)
    .maybeSingle();
  if (patientError || patient?.role !== "user") {
    return NextResponse.json({ error: "Paciente não encontrado." }, { status: 404 });
  }

  // A FK profiles -> auth.users e os ON DELETE CASCADE removem os dados em uma unica operacao.
  const { error } = await context.adminClient.auth.admin.deleteUser(patientId);
  if (error) {
    return NextResponse.json(
      { error: `Não foi possível excluir definitivamente: ${error.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
