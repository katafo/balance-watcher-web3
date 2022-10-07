import Web3 from "web3";
import { BalanceChangeEventService } from "./services/balanceChangeEvent.service";
import { Web3Service } from "./services/web3.service";

const SCAN_TIME_INTERVAL = 10; // seconds
const BLOCKS_LIMIT = 1;

const ethProvider = new Web3.providers.HttpProvider(
  "https://eth-rpc.gateway.pokt.network/"
);

const web3Service = new Web3Service(new Web3(ethProvider));
const balanceChangeEventService = new BalanceChangeEventService(web3Service);

web3Service.scanBlocks(SCAN_TIME_INTERVAL, BLOCKS_LIMIT, async (blocks) => {
  await balanceChangeEventService.trackEventByBlocks(blocks, (event) => {
    console.log(event);
    console.log("------------------");
  });
});
