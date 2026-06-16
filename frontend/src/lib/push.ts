import { api } from './api';

/** Whether this browser can do Web Push at all. */
export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export function notificationPermission(): NotificationPermission {
  return pushSupported() ? Notification.permission : 'denied';
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function serialize(sub: PushSubscription): { endpoint: string; p256dh: string; auth: string } {
  const json = sub.toJSON();
  return {
    endpoint: sub.endpoint,
    p256dh: json.keys?.p256dh ?? '',
    auth: json.keys?.auth ?? '',
  };
}

/** Returns the existing push subscription for this device, if any. */
export async function getExistingSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

/**
 * Request permission, subscribe via the SW push manager, and register the
 * subscription with the worker. Throws on permission denial or failure.
 */
export async function subscribeToPush(): Promise<void> {
  if (!pushSupported()) throw new Error('Push notifications are not supported on this device.');

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notification permission was not granted.');

  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();

  if (!sub) {
    const { publicKey } = await api.get<{ publicKey: string }>('/api/push/vapid-key');
    if (!publicKey) throw new Error('Server is missing its VAPID key.');
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
    });
  }

  await api.post('/api/push/subscribe', serialize(sub));
}

/** Unsubscribe this device and remove it from the worker. */
export async function unsubscribeFromPush(): Promise<void> {
  const sub = await getExistingSubscription();
  if (!sub) return;
  const { endpoint } = serialize(sub);
  await sub.unsubscribe().catch(() => {});
  await api.delete('/api/push/subscribe', { endpoint });
}

/** Ask the worker to send a test notification to this user's devices. */
export async function sendTestPush(): Promise<void> {
  await api.post('/api/push/test');
}
