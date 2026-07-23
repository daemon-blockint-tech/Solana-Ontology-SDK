export const SOLANA_PROGRAM_IDS = {
  System: "11111111111111111111111111111111",
  Token: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  Token2022: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
  ComputeBudget: "ComputeBudget111111111111111111111111111111",
  AssociatedToken: "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
  Memo: "MemoSq4fbqzTXNnnD2t5yy2N3KpEPGqLm5YwqJ3xXqR",
  BPFLoader: "BPFLoader2111111111111111111111111111111111",
  Vote: "Vote111111111111111111111111111111111111111",
  Stake: "Stake11111111111111111111111111111111111111",
  Config: "Config1111111111111111111111111111111111111",
  AddressLookupTable: "AddressLookupTab1e1111111111111111111111111",
  BPFLoaderDeprecated: "BPFLoader1111111111111111111111111111111111",
  Ed25519: "Ed25519SignatureVerification1111111111111111111",
  Secp256k1: "KeccakSecp256k11111111111111111111111111111",
} as const;

export type ProgramIdName = keyof typeof SOLANA_PROGRAM_IDS;

export function getProgramId(name: ProgramIdName): string {
  return SOLANA_PROGRAM_IDS[name];
}

export function findProgramIdByAddress(address: string): ProgramIdName | null {
  for (const [name, id] of Object.entries(SOLANA_PROGRAM_IDS)) {
    if (id === address) return name as ProgramIdName;
  }
  return null;
}
