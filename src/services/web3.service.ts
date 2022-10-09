import cron from "node-cron";
import Web3 from "web3";
import { BlockTransactionObject } from "web3-eth";
import { AbiItem } from "web3-utils";

const ERC20_STANDARD_ABI: AbiItem[] = [
  {
    constant: true,
    inputs: [],
    name: "name",
    outputs: [{ name: "", type: "string" }],
    payable: false,
    stateMutability: "view",
    type: "function",
  },
  {
    constant: false,
    inputs: [
      { name: "_spender", type: "address" },
      { name: "_value", type: "uint256" },
    ],
    name: "approve",
    outputs: [{ name: "", type: "bool" }],
    payable: false,
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    constant: true,
    inputs: [],
    name: "totalSupply",
    outputs: [{ name: "", type: "uint256" }],
    payable: false,
    stateMutability: "view",
    type: "function",
  },
  {
    constant: false,
    inputs: [
      { name: "_from", type: "address" },
      { name: "_to", type: "address" },
      { name: "_value", type: "uint256" },
    ],
    name: "transferFrom",
    outputs: [{ name: "", type: "bool" }],
    payable: false,
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    constant: true,
    inputs: [],
    name: "decimals",
    outputs: [{ name: "", type: "uint8" }],
    payable: false,
    stateMutability: "view",
    type: "function",
  },
  {
    constant: true,
    inputs: [{ name: "_owner", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "balance", type: "uint256" }],
    payable: false,
    stateMutability: "view",
    type: "function",
  },
  {
    constant: true,
    inputs: [],
    name: "symbol",
    outputs: [{ name: "", type: "string" }],
    payable: false,
    stateMutability: "view",
    type: "function",
  },
  {
    constant: false,
    inputs: [
      { name: "_to", type: "address" },
      { name: "_value", type: "uint256" },
    ],
    name: "transfer",
    outputs: [{ name: "", type: "bool" }],
    payable: false,
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    constant: true,
    inputs: [
      { name: "_owner", type: "address" },
      { name: "_spender", type: "address" },
    ],
    name: "allowance",
    outputs: [{ name: "", type: "uint256" }],
    payable: false,
    stateMutability: "view",
    type: "function",
  },
  { payable: true, stateMutability: "payable", type: "fallback" },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "owner", type: "address" },
      { indexed: true, name: "spender", type: "address" },
      { indexed: false, name: "value", type: "uint256" },
    ],
    name: "Approval",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "from", type: "address" },
      { indexed: true, name: "to", type: "address" },
      { indexed: false, name: "value", type: "uint256" },
    ],
    name: "Transfer",
    type: "event",
  },
];

export class Web3Service {
  web3: Web3;
  private currentBlockNumber: number;
  private isScaningBlocks: boolean;
  private scanTask: cron.ScheduledTask;

  constructor(web3: Web3) {
    this.web3 = web3;
    this.isScaningBlocks = false;
  }

  getBlocks = async (fromBlock: number, limit: number) => {
    const blocks: BlockTransactionObject[] = [];
    try {
      for (let i = 1; i <= limit; i++) {
        const block = await this.web3.eth.getBlock(fromBlock + i, true);
        if (block) {
          blocks.push(block);
        }
      }
      return blocks;
    } catch {
      return blocks;
    }
  };

  scanBlocks = (
    interval: number,
    limit: number,
    onChanged?: (blocks: BlockTransactionObject[]) => Promise<void>
  ) => {
    this.scanTask?.stop();
    const cronExpression = `*/${interval} * * * * *`;
    this.scanTask = cron.schedule(cronExpression, async () => {
      try {
        if (this.isScaningBlocks) {
          return;
        }
        this.isScaningBlocks = true;

        const latestBlockNumber = await this.web3.eth.getBlockNumber();

        if (!this.currentBlockNumber) {
          this.currentBlockNumber = latestBlockNumber;
        } else if (latestBlockNumber === this.currentBlockNumber) {
          this.isScaningBlocks = false;
          return;
        }

        console.log("scan from block: ", this.currentBlockNumber);

        const blocks = await this.getBlocks(this.currentBlockNumber, limit);
        if (blocks.length > 0) {
          // If we don't care about missing transactions when error occurs, we can use try-catch to ignore it. Then, force update currentBlockNumber
          // But if we need to handle completely all transactions, we must create a "event-logs" table in database. It's will store completed transactions...
          // and currentBlockNumber will be only update when all transfer transactions in this block completed.
          // Otherwise, cron-job will fetch again old block, then compare transactions with stored transactions...
          // if it's not existed, start handling it again.
          try {
            await onChanged(blocks);
          } catch (err) {
            console.log(err);
          }
          this.currentBlockNumber = blocks[blocks.length - 1].number;
        }

        this.isScaningBlocks = false;
      } catch {
        this.isScaningBlocks = false;
      }
    });
    this.scanTask.start();
  };

  decodeParameter = (type: string, data: string) => {
    return this.web3.eth.abi.decodeParameter(type, data);
  };

  createERC20Contract = (address: string) => {
    return new this.web3.eth.Contract(ERC20_STANDARD_ABI, address);
  };

  getNativeBalance = async (address: string, blockNumber: number) => {
    const balanceStr = await this.web3.eth.getBalance(address, blockNumber);
    return Number(Web3.utils.fromWei(balanceStr, "ether"));
  };
}
