import Web3 from "web3";
import { BlockTransactionObject, Transaction } from "web3-eth";
import {
  BalanceChangeEvent,
  BlockchainType,
} from "../models/balanceChangeEvent.model";
import { Web3Service } from "./web3.service";

const TRANSFER_HASH = Web3.utils.keccak256("Transfer(address,address,uint256)");

export class BalanceChangeEventService {
  web3Service: Web3Service;

  constructor(web3Service: Web3Service) {
    this.web3Service = web3Service;
  }

  trackEventByBlocks = async (
    blocks: BlockTransactionObject[],
    emit: (event: BalanceChangeEvent) => void
  ) => {
    for (const block of blocks) {
      for (const tx of block.transactions) {
        await this.trackEventByTransaction(tx, emit);
      }
    }
  };

  trackEventByTransaction = async (
    transaction: Transaction,
    emit: (event: BalanceChangeEvent) => void
  ) => {
    const events: BalanceChangeEvent[] = [];
    const transactionReceipt =
      await this.web3Service.web3.eth.getTransactionReceipt(transaction.hash);

    if (!transactionReceipt) return;

    const transactionCost =
      Number(Web3.utils.fromWei(transaction.gasPrice, "ether")) *
      transactionReceipt.gasUsed;

    const transactionValue = Number(
      Web3.utils.fromWei(transaction.value, "ether")
    );

    // Native token
    if (transactionValue > 0) {
      const senderEvent = await this.createSenderBalanceChangeEvent(
        transaction.from,
        transaction,
        transactionCost,
        transactionValue
      );
      events.push(senderEvent);
      const receiverEvent = await this.createReceiverBalanceChangeEvent(
        transaction.to,
        transaction,
        transactionCost,
        transactionValue
      );
      events.push(receiverEvent);
      return;
    }

    // ERC20 Token
    const transferLogs = transactionReceipt.logs.filter(
      (log) => log.topics?.length === 3 && log.topics[0] === TRANSFER_HASH
    );

    const senderEvent = await this.createSenderBalanceChangeEvent(
      transaction.from,
      transaction,
      transactionCost,
      transactionValue
    );

    events.push(senderEvent);

    for (const log of transferLogs) {
      if (log.topics?.length < 3 || log.topics[0] !== TRANSFER_HASH) return;

      const from = this.web3Service.decodeParameter("address", log.topics[1]);
      const to = this.web3Service.decodeParameter("address", log.topics[2]);

      const contract = this.web3Service.createERC20Contract(log.address);

      // ensure address is ERC-20 by checking totalSupply method
      const totalSupply = await contract.methods.totalSupply().call();
      if (!totalSupply || totalSupply == "0x") {
        return;
      }

      const symbol = await contract.methods.symbol().call();
      const decimals = await contract.methods.decimals().call();

      const val = Web3.utils
        .toBN(`${this.web3Service.decodeParameter("uint256", log.data)}`)
        .div(Web3.utils.toBN(Math.pow(10, decimals)))
        .toNumber();

      const senderBalance = await contract.methods.balanceOf(from).call();
      const senderBalanceVal = Web3.utils
        .toBN(senderBalance)
        .div(Web3.utils.toBN(Math.pow(10, decimals)))
        .toNumber();

      const senderTokenChange = {
        symbol,
        mint: "",
        preAmount: senderBalanceVal + val,
        postAmount: senderBalanceVal,
      };

      if (senderEvent.accountAddress === `${from}`) {
        senderEvent.tokenChanges.push(senderTokenChange);
      } else {
        const senderEvent = await this.createSenderBalanceChangeEvent(
          `${from}`,
          transaction,
          0,
          0
        );
        senderEvent.tokenChanges.push();
        events.push(senderEvent);
      }

      const receiverEvent = await this.createReceiverBalanceChangeEvent(
        `${to}`,
        transaction,
        transactionCost,
        0
      );
      receiverEvent.accountAddress = `${to}`;
      const receiverBalance = await contract.methods.balanceOf(to).call();
      const receiverBalanceVal = Web3.utils
        .toBN(receiverBalance)
        .div(Web3.utils.toBN(Math.pow(10, decimals)))
        .toNumber();
      receiverEvent.tokenChanges.push({
        symbol,
        mint: "",
        preAmount: Math.max(0, receiverBalanceVal - val),
        postAmount: receiverBalanceVal,
      });
      events.push(receiverEvent);
    }

    events.forEach((e) => emit(e));
  };

  createBalanceChangeEvent = (address: string, transaction: Transaction) => {
    const event = <BalanceChangeEvent>{};
    event.accountAddress = address;
    event.accountAddressBlockchain = BlockchainType.Ethereum;
    event.blockHash = transaction.blockHash;
    event.sequenceNumber = transaction.blockNumber;
    event.tokenChanges = [];
    event.currencyString = "ETH";
    return event;
  };

  createSenderBalanceChangeEvent = async (
    address: string,
    transaction: Transaction,
    transactionCost: number,
    transactionValue: number
  ) => {
    const senderEvent = this.createBalanceChangeEvent(address, transaction);
    senderEvent.transactionCost = transactionCost;

    const senderBalanceStr = await this.web3Service.web3.eth.getBalance(
      senderEvent.accountAddress,
      senderEvent.blockHash
    );
    const senderBalance = Number(Web3.utils.fromWei(senderBalanceStr, "ether"));
    senderEvent.currentNativeBalance = senderBalance;
    senderEvent.previousNativeBalance =
      senderBalance + transactionCost + transactionValue;
    return senderEvent;
  };

  createReceiverBalanceChangeEvent = async (
    address: string,
    transaction: Transaction,
    transactionCost: number,
    transactionValue: number
  ) => {
    const receiverEvent = this.createBalanceChangeEvent(address, transaction);
    receiverEvent.transactionCost = transactionCost;

    const receiverBalanceStr = await this.web3Service.web3.eth.getBalance(
      receiverEvent.accountAddress,
      receiverEvent.blockHash
    );
    const receiverBalance = Number(
      Web3.utils.fromWei(receiverBalanceStr, "ether")
    );
    receiverEvent.currentNativeBalance = receiverBalance;
    receiverEvent.previousNativeBalance = Math.max(
      0,
      receiverBalance - transactionValue
    );
    return receiverEvent;
  };
}
