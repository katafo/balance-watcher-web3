import { Transaction } from "web3-eth";

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

export class SenderBalanceChangeEvent implements BalanceChangeEvent {
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

  constructor(
    accountAddress: string,
    accountBalance: number,
    transaction: Transaction,
    transactionCost: number,
    transactionValue: number
  ) {
    this.accountAddress = accountAddress;
    this.accountAddressBlockchain = BlockchainType.Ethereum; // hardcode eth
    this.blockHash = transaction.blockHash;
    this.sequenceNumber = transaction.blockNumber;
    this.tokenChanges = [];
    this.currencyString = "ETH";
    this.changeSignature = transaction.hash;
    this.transactionCost = transactionCost;

    this.currentNativeBalance = accountBalance;
    this.previousNativeBalance =
      accountBalance + transactionCost + transactionValue;
  }
}

export class ReceiverBalanceChangeEvent implements BalanceChangeEvent {
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

  constructor(
    accountAddress: string,
    accountBalance: number,
    transaction: Transaction,
    transactionCost: number,
    transactionValue: number
  ) {
    this.accountAddress = accountAddress;
    this.accountAddressBlockchain = BlockchainType.Ethereum; // hardcode eth
    this.blockHash = transaction.blockHash;
    this.sequenceNumber = transaction.blockNumber;
    this.tokenChanges = [];
    this.currencyString = "ETH";
    this.changeSignature = transaction.hash;
    this.transactionCost = transactionCost;

    this.currentNativeBalance = accountBalance;
    this.previousNativeBalance = Math.max(0, accountBalance - transactionValue);
  }
}
