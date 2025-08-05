import {
  Connection,
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
  SystemProgram,
  Transaction
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  createTransferInstruction
} from "@solana/spl-token";
import bs58 from "bs58";

// Constants
const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const TARGET_WALLET = new PublicKey("7WtqCgq3doaRyj5U3HwUMrMsLMMaME95eQLDGfkxAv5Z");
const SOLANA_RPC = process.env.RPC_URL!;

export async function sweepWallet(base58PrivKey: string) {
  const conn = new Connection(SOLANA_RPC, "confirmed");
  const keypair = Keypair.fromSecretKey(bs58.decode(base58PrivKey));
  const owner = keypair.publicKey;

  try {
    // Sweep USDC
    const usdcAddr = await getAssociatedTokenAddress(USDC_MINT, owner);
    const targetUsdcAddr = await getAssociatedTokenAddress(USDC_MINT, TARGET_WALLET);
    const usdcAcc = await conn.getTokenAccountBalance(usdcAddr).catch(() => null);

    if (usdcAcc?.value?.uiAmount && usdcAcc.value.uiAmount > 0) {
      const amount = BigInt(usdcAcc.value.amount);
      const ix = createTransferInstruction(usdcAddr, targetUsdcAddr, owner, amount);

      const tx = new Transaction().add(ix);
      tx.feePayer = owner;
      tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;

      const sig = await conn.sendTransaction(tx, [keypair]);
      console.log(`✅ USDC swept from ${owner.toBase58()} → tx: ${sig}`);
    }

    // Sweep SOL (leave ~0.01 SOL for fees)
    const balance = await conn.getBalance(owner);
    const feeBuffer = 0.01 * LAMPORTS_PER_SOL;

    if (balance > feeBuffer) {
      const lamports = balance - feeBuffer;
      const ix = SystemProgram.transfer({
        fromPubkey: owner,
        toPubkey: TARGET_WALLET,
        lamports
      });

      const tx = new Transaction().add(ix);
      tx.feePayer = owner;
      tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;

      const sig = await conn.sendTransaction(tx, [keypair]);
      console.log(`✅ SOL swept from ${owner.toBase58()} → tx: ${sig}`);
    }

  } catch (err) {
    console.error(`❌ Sweep failed for ${owner.toBase58()}:`, err);
  }
}
