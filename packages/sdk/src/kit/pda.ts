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
export async function derivePdaWeb3(programId: string, seeds: Uint8Array[]): Promise<PdaResult> {
  const { PublicKey } = await import("@solana/web3.js");
  const pkSeeds = seeds.map((s) => Buffer.from(s));
  const [address, bump] = await PublicKey.findProgramAddress(pkSeeds, new PublicKey(programId));
  return { address: address.toBase58(), bump };
}

/**
 * Derive a PDA using @solana/kit getProgramDerivedAddress.
 * @param programId Program ID as base58 string
 * @param seeds Array of seed byte arrays
 */
export async function derivePdaKit(programId: string, seeds: Uint8Array[]): Promise<PdaResult> {
  try {
    const kit = await import("@solana/kit");
    const { getProgramDerivedAddress, address } = kit;

    const [pdaAddress, bump] = await getProgramDerivedAddress({
      programAddress: address(programId),
      seeds,
    });

    return { address: pdaAddress as string, bump };
  } catch (err) {
    if (err instanceof Error && (err.message.includes("Cannot find module") || err.message.includes("@solana/kit is not installed"))) {
      throw new Error("@solana/kit is not installed");
    }
    throw err;
  }
}

/**
 * Derive a PDA using whichever SDK is available.
 * Tries Kit first, falls back to web3.js.
 */
export async function derivePda(programId: string, seeds: Uint8Array[]): Promise<PdaResult> {
  try {
    return await derivePdaKit(programId, seeds);
  } catch (err) {
    if (err instanceof Error && err.message.includes("@solana/kit is not installed")) {
      return await derivePdaWeb3(programId, seeds);
    }
    throw err;
  }
}

/**
 * Derive a PDA from a concept's pdaSeeds definition.
 * Reads the seed structure from the concept and converts provided values to bytes in order.
 *
 * @param concept The concept with pdaSeeds defined
 * @param programId Program ID (defaults to concept.programId if set)
 * @param seedValues Map of seed name to value (string, number, or Uint8Array)
 * @returns PDA result with address and bump
 */
export async function derivePdaFromConcept(
  concept: { pdaSeeds?: { name: string; type: string }[]; programId?: string },
  programId: string | undefined,
  seedValues: Record<string, string | number | Uint8Array>,
): Promise<PdaResult> {
  if (!concept.pdaSeeds || concept.pdaSeeds.length === 0) {
    throw new Error(`Concept has no pdaSeeds defined`);
  }
  const pid = programId ?? concept.programId;
  if (!pid) {
    throw new Error(`No programId provided and concept has no default programId`);
  }

  const seeds: Uint8Array[] = [];
  for (const seed of concept.pdaSeeds) {
    const value = seedValues[seed.name];
    if (value === undefined) {
      throw new Error(`Missing seed value for "${seed.name}"`);
    }
    seeds.push(await convertSeedToBytes(value, seed.type));
  }

  return derivePda(pid, seeds);
}

async function convertSeedToBytes(value: string | number | Uint8Array, type: string): Promise<Uint8Array> {
  if (value instanceof Uint8Array) return value;

  switch (type) {
    case "string":
      return new TextEncoder().encode(String(value));
    case "u8": {
      const buf = new Uint8Array(1);
      buf[0] = Number(value) & 0xff;
      return buf;
    }
    case "u32": {
      const buf = new Uint8Array(4);
      const view = new DataView(buf.buffer);
      view.setUint32(0, Number(value), true);
      return buf;
    }
    case "u64": {
      const buf = new Uint8Array(8);
      const view = new DataView(buf.buffer);
      view.setBigUint64(0, BigInt(value), true);
      return buf;
    }
    case "publicKey": {
      const { PublicKey } = await import("@solana/web3.js");
      return new PublicKey(String(value)).toBytes();
    }
    case "bytes":
      return value instanceof Uint8Array ? value : new TextEncoder().encode(String(value));
    default:
      return new TextEncoder().encode(String(value));
  }
}
