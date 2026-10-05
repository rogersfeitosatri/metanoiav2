import { z } from "zod";

export function validPushEndpoint(value: string): boolean {
  try {
    const url = new URL(value);
    const host = url.hostname;
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      (!url.port || url.port === "443") &&
      (host === "fcm.googleapis.com" ||
        host === "updates.push.services.mozilla.com" ||
        host === "web.push.apple.com" ||
        host.endsWith(".notify.windows.com"))
    );
  } catch {
    return false;
  }
}
export const SubscriptionSchema = z.object({
  endpoint: z.string().max(3000).refine(validPushEndpoint),
  keys: z.object({
    p256dh: z.string().regex(/^[A-Za-z0-9_-]{80,100}={0,2}$/),
    auth: z.string().regex(/^[A-Za-z0-9_-]{20,30}={0,2}$/),
  }),
});
