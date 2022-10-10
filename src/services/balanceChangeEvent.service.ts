import Web3 from "web3";
import { BlockTransactionObject, Transaction } from "web3-eth";
import {
  BalanceChangeEvent,
  ReceiverBalanceChangeEvent,
  SenderBalanceChangeEvent,
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

    const senderBalance = await this.web3Service.getNativeBalance(
      transaction.from,
      transaction.blockNumber
    );
    const senderEvent = new SenderBalanceChangeEvent(
      transaction.from,
      senderBalance,
      transaction,
      transactionCost,
      transactionValue
    );

    events.push(senderEvent);

    // Native token
    if (transactionValue > 0) {
      const receiverBalance = await this.web3Service.getNativeBalance(
        transaction.to,
        transaction.blockNumber
      );
      const receiverEvent = new ReceiverBalanceChangeEvent(
        transaction.to,
        receiverBalance,
        transaction,
        transactionCost,
        transactionValue
      );
      events.push(receiverEvent);
      return;
    }

    // ERC20 Token: read all "Transfer" methods from logs data, then emit events
    const transferLogs = transactionReceipt.logs.filter(
      (log) => log.topics?.length === 3 && log.topics[0] === TRANSFER_HASH
    );

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

      const senderBalance = await contract.methods
        .balanceOf(from)
        .call({}, transaction.blockNumber);
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

      const transferFrom = `${from}`;
      const transferTo = `${to}`;

      if (senderEvent.accountAddress === transferFrom) {
        // if sender is owner of transaction, just push more token change
        senderEvent.tokenChanges.push(senderTokenChange);
      } else {
        // if sender is not owner, create new sender event with 0 cost & value
        const senderNativeBalance = await this.web3Service.getNativeBalance(
          transferFrom,
          transaction.blockNumber
        );
        const senderEvent = new SenderBalanceChangeEvent(
          transferFrom,
          senderNativeBalance,
          transaction,
          0,
          0
        );
        senderEvent.tokenChanges.push(senderTokenChange);
        events.push(senderEvent);
      }

      // receiver token balance change
      const receiverNativeBalance = await this.web3Service.getNativeBalance(
        transferFrom,
        transaction.blockNumber
      );
      const receiverEvent = new ReceiverBalanceChangeEvent(
        transferTo,
        receiverNativeBalance,
        transaction,
        transactionCost,
        0
      );

      const receiverBalance = await contract.methods
        .balanceOf(to)
        .call({}, transaction.blockNumber);
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
}
