import { networkInterfaces } from 'node:os';
import QRCode from 'qrcode';
import { env } from '../config/env.js';

/**
 * Public URL of an ngrok tunnel to the frontend, read from the local ngrok agent API.
 * Free ngrok URLs change on every start, hence detected at runtime instead of hard-coded.
 */
async function ngrokUrl(): Promise<string | null> {
  try {
    const res = await fetch('http://127.0.0.1:4040/api/tunnels', { signal: AbortSignal.timeout(1000) });
    if (!res.ok) return null;
    const { tunnels } = (await res.json()) as { tunnels: { public_url: string; proto: string }[] };
    return tunnels.find((t) => t.proto === 'https')?.public_url ?? null;
  } catch {
    return null;
  }
}

/**
 * Base URL encoded in the QR labels. A phone cannot open "localhost" (that is the phone itself),
 * so when FRONTEND_URL points to localhost we use, in order: a running ngrok tunnel (reachable
 * from any network) or this machine's LAN IP (same Wi-Fi only).
 */
async function publicBaseUrl(): Promise<string> {
  const url = new URL(env.FRONTEND_URL);
  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
    const tunnel = await ngrokUrl();
    if (tunnel) return new URL(tunnel).origin;
    const lanIp = Object.values(networkInterfaces())
      .flat()
      .find((addr) => addr && addr.family === 'IPv4' && !addr.internal && !addr.address.startsWith('169.254.'));
    if (lanIp) url.hostname = lanIp.address;
  }
  return url.origin;
}

/** The physical QR label encodes a URL to the public equipment page. */
export async function equipmentUrl(code: string): Promise<string> {
  return `${await publicBaseUrl()}/equipment/${code}`;
}

export async function generateEquipmentQrSvg(code: string): Promise<string> {
  return QRCode.toString(await equipmentUrl(code), { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
}
