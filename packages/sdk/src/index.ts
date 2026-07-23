export { OntologyClient, type OntologyClientConfig } from "./kit/client.js";
export {
  fetchAccount,
  fetchMultipleAccounts,
  type AccountDecoder,
  type RawAccountData,
} from "./kit/account.js";
export {
  derivePda,
  derivePdaKit,
  derivePdaWeb3,
  derivePdaFromConcept,
  type PdaResult,
} from "./kit/pda.js";
export { ActionBuilder, type ActionInstruction } from "./kit/action.js";
export { OntologyQuery, createConceptQuery, type QueryOptions } from "./kit/query.js";

export { Web3jsAdapter, type Web3AccountInfo } from "./web3js/adapter.js";
export {
  web3PubkeyToString,
  stringToWeb3Pubkey,
  web3DataToBytes,
  normalizeWeb3Account,
  type NormalizedAccount,
} from "./web3js/compat.js";

// ── Kinetic Action Layer ───────────────────────────────────────────────────

export {
  TransactionLifecycle,
  type TransactionLifecycleOptions,
  type SimulationResult,
  type DispatchResult,
} from "./kit/transaction-lifecycle.js";

export {
  KeypairSigner,
  KmsSigner,
  MpcSigner,
  type SignerProvider,
  type SignedTransaction,
} from "./kit/signer.js";

export {
  compileInstruction,
  encodeInstructionData,
  encodeBorshValue,
  resolveAccounts,
  type IdlInstructionDef,
  type CompiledAccount,
} from "./kit/instruction-compiler.js";

export { BlockhashCache, fetchLatestBlockhash, type BlockhashInfo } from "./kit/blockhash.js";

export {
  ConfirmationTracker,
  type PendingTransaction,
  type TransactionStatus,
} from "./kit/confirmation.js";

export { TransactionEventEmitter, type TransactionEventName } from "./kit/event-emitter.js";
