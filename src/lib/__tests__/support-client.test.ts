import { afterEach, describe, expect, it, vi } from "vitest";
import { disablePushDevice, enablePushDevice } from "../support-client";

afterEach(() => vi.unstubAllGlobals());

describe("Permissão e desligamento do aparelho", () => {
  it("desinscreve o aparelho mesmo se a rede falhar", async () => {
    const unsubscribe = vi.fn().mockResolvedValue(true);
    vi.stubGlobal("navigator", {
      serviceWorker: {
        getRegistration: async () => ({
          pushManager: {
            getSubscription: async () => ({
              endpoint: "https://fcm.googleapis.com/example",
              unsubscribe,
            }),
          },
        }),
      },
    });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await expect(disablePushDevice()).rejects.toThrow("offline");
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it("pede permissão dentro do clique, antes de qualquer requisição", async () => {
    const requestPermission = vi.fn().mockResolvedValue("denied");
    vi.stubGlobal("Notification", { permission: "default", requestPermission });
    vi.stubGlobal("window", { Notification: {}, PushManager: {} });
    vi.stubGlobal("navigator", { serviceWorker: {} });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const enabling = enablePushDevice("public-key");
    expect(requestPermission).toHaveBeenCalledOnce();
    expect(fetchMock).not.toHaveBeenCalled();
    await expect(enabling).rejects.toThrow("Sem autorização");
  });
});
