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
  type PdaResult,
} from "./kit/pda.js";
export { ActionBuilder, type ActionInstruction } from "./kit/action.js";
export {
  OntologyQuery,
  createConceptQuery,
  type QueryOptions,
} from "./kit/query.js";

export { Web3jsAdapter, type Web3AccountInfo } from "./web3js/adapter.js";
export {
  web3PubkeyToString,
  stringToWeb3Pubkey,
  web3DataToBytes,
  normalizeWeb3Account,
  type NormalizedAccount,
} from "./web3js/compat.js";
