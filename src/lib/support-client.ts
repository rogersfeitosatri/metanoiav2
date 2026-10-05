export async function disablePushDevice() {
  if (!("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration("/");
  const sub = await registration?.pushManager.getSubscription();
  if (!sub) return;
  let response: Response;
  try {
    response = await fetch("/api/support/subscription", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    });
  } finally {
    await sub.unsubscribe();
  }
  if (!response.ok)
    throw new Error(
      "O aparelho foi desativado, mas não consegui atualizar a conta. Tenta novamente.",
    );
}
export async function enablePushDevice(publicKey: string) {
  if (
    !("Notification" in window) ||
    !("serviceWorker" in navigator) ||
    !("PushManager" in window)
  )
    throw new Error(
      "Este navegador não oferece notificações. No iPhone, abre o Metanóia pela tela de início.",
    );
  if (Notification.permission === "denied")
    throw new Error(
      "Notificações bloqueadas nas permissões deste site. Altera essa escolha no navegador para ativar.",
    );
  if (!publicKey)
    throw new Error(
      "As notificações ainda não estão disponíveis neste ambiente. Os convites continuam no app.",
    );
  // Keep the permission request in the click's user activation (required on iOS).
  const permission = await Notification.requestPermission();
  if (permission !== "granted")
    throw new Error(
      "Sem autorização. Nenhuma notificação será enviada para este aparelho.",
    );
  const registration = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  const raw = atob(publicKey.replace(/-/g, "+").replace(/_/g, "/"));
  const key = Uint8Array.from(raw, (c: string) => c.charCodeAt(0));
  const sub =
    (await registration.pushManager.getSubscription()) ||
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: key,
    }));
  try {
    const saved = await fetch("/api/support/subscription", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(sub.toJSON()),
    });
    if (!saved.ok)
      throw new Error("O aparelho não foi ativado. Tenta novamente.");
  } catch (error) {
    await sub.unsubscribe();
    throw error;
  }
}
