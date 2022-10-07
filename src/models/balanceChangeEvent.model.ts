export interface TokenChange {
  symbol: string;
  mint: string;
  preAmount: number;
  postAmount: number;
}

export enum BlockchainType {
  Solana = 0,
  Near,
  Ethereum,
}

export enum BalanceChangeEventType {
  Sender = 0,
  Receiver,
}

export interface BalanceChangeEvent {
  currencyString: string;
  accountAddress: string;
  accountAddressBlockchain: BlockchainType;
  currentNativeBalance: number;
  previousNativeBalance: number;
  transactionCost: number;
  blockHash?: string;
  sequenceNumber: number;
  changeSignature: string;
  tokenChanges: TokenChange[];
}
