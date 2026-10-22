// Amprenta codului: PBKDF2-SHA256, 150 000 de iterații, sare aleatoare
const enc = new TextEncoder();
const hex = (b: ArrayBuffer | Uint8Array) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");

export function newSalt(): string {
  return hex(crypto.getRandomValues(new Uint8Array(16)));
}

export async function hashPin(pin: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: enc.encode(salt), iterations: 150_000 }, key, 256);
  return hex(bits);
}

export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export const validPin = (p: unknown) => typeof p === "string" && /^\d{4}$/.test(p);

// După 5 greșeli: 1 min, 2, 4, 8… până la 60 de minute
export function lockMinutes(failed: number): number {
  if (failed < 5) return 0;
  return Math.min(60, 2 ** (failed - 5));
}
