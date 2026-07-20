/**
 * Runtime PDA derivation helpers.
 * Supports both @solana/kit and web3.js v1.
 */

export interface PdaResult {
  address: string;
  bump: number;
}

/**
 * Derive a PDA using web3.js v1 PublicKey.findProgramAddress.
 * @param programId Program ID as base58 string
 * @param seeds Array of seed byte arrays
 */
export async function derivePdaWeb3(
  programId: string,
  seeds: Uint8Array[],
): Promise<PdaResult> {
  const { PublicKey } = await import("@solana/web3.js");
  const pkSeeds = seeds.map((s) => Buffer.from(s));
  const [address, bump] = await PublicKey.findProgramAddress(
    pkSeeds,
    new PublicKey(programId),
  );
  return { address: address.toBase58(), bump };
}

/**
 * Derive a PDA using @solana/kit getProgramDerivedAddress.
 * @param programId Program ID as base58 string
 * @param seeds Array of seed byte arrays
 */
export async function derivePdaKit(
  programId: string,
  seeds: Uint8Array[],
): Promise<PdaResult> {
  try {
    const kit = await import("@solana/kit");
    const {
      getProgramDerivedAddress,
      address,
    } = kit;

    const seedBytes = seeds.map((s) => ({
      bytes: s as unknown as Uint8Array,
    }));

    const result = await getProgramDerivedAddress(
      seedBytes,
      address(programId),
    );

    return {
      address: result.pda as string,
      bump: result.bump as number,
    };
  } catch {
    throw new Error(
      "Failed to derive PDA with @solana/kit. Ensure it is installed.",
    );
  }
}

/**
 * Derive a PDA using whichever SDK is available.
 * Tries Kit first, falls back to web3.js.
 */
export async function derivePda(
  programId: string,
  seeds: Uint8Array[],
): Promise<PdaResult> {
  try {
    return await derivePdaKit(programId, seeds);
  } catch {
    return await derivePdaWeb3(programId, seeds);
  }
}
