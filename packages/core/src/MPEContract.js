import MPEAbi from 'singularitynet-platform-contracts/abi/MultiPartyEscrow';
import MPENetworks from 'singularitynet-platform-contracts/networks/MultiPartyEscrow';
import { BigNumber } from 'bignumber.js';
import { map } from 'lodash';

import PaymentChannel from './PaymentChannel';
import logger from './utils/logger';
import { toBNString } from './utils/bignumber_helper';

class MPEContract {
  /**
   * @param {Web3} web3
   * @param {number} networkId
   */
  constructor(web3, networkId) {
    this._web3 = web3;
    this._networkId = networkId;
    this._contract = new this._web3.eth.Contract(MPEAbi, MPENetworks[networkId].address);
  }

  /**
   * An instance of Multi Party Contract generated by Web3
   * @type {Contract}
   * @see {@link https://web3js.readthedocs.io/en/1.0/web3-eth-contract.html|Web3 Contract}
   */
  get contract() {
    return this._contract;
  }

  /**
   * The public address of the MPE account
   * @type {string}
   */
  get address() {
    return this.contract.address;
  }

  /**
   * Returns the balance against the address in Multi Party Escrow Account
   * @param {string} address - The public address of account
   * @returns {Promise<BigNumber>}
   */
  async balance(address) {
    logger.debug('Fetching MPE account balance', { tags: ['MPE'] });
    return this.contract.methods.balances(address).call()
  }

  /**
   * Transfers tokens from the account to MPE account
   * @param {Account} account - The account from which the tokens needs to be transferred.
   * @param {BigNumber} amountInCogs - The amount to transfer in cogs
   * @returns {Promise.<TransactionReceipt>}
   */
  async deposit(account, amountInCogs) {
    const amount = toBNString(amountInCogs);
    logger.info(`Depositing ${amount}cogs to MPE account`, { tags: ['MPE'] });
    const depositOperation = this.contract.methods.deposit;
    return account.sendTransaction(this.address, depositOperation, amount);
  }

  /**
   * Withdraws tokens from MPE account and deposits to the account
   * @param {Account} account - The account to deposit tokens
   * @param {BigNumber} amountInCogs - The amount to be withdrawn
   * @returns {Promise.<TransactionReceipt>}
   */
  async withdraw(account, amountInCogs) {
    const amount = toBNString(amountInCogs);
    logger.info(`Withdrawing ${amount}cogs from MPE account`, { tags: ['MPE'] });
    const withdrawOperation = this.contract.methods.withdraw;
    return account.sendTransaction(this.address, withdrawOperation, amount);
  }

  /**
   * Opens a payment channel between an account and the given service with the specified tokens and expiry period
   * @param {Account} account - The account to create payment channel for
   * @param {ServiceClient} service - The AI service between which the payment channel needs to be opened
   * @param {BigNumber} amountInCogs - The initial tokens with the which payment channel needs to be opened
   * @param {BigNumber} expiry - The expiry of the payment channel in terms of block number
   * @returns {Promise.<TransactionReceipt>}
   */
  async openChannel(account, service, amountInCogs, expiry) {
    const amount = toBNString(amountInCogs);
    const expiryStr = toBNString(expiry);
    const {
      payment_address: recipientAddress,
      group_id_in_bytes: groupId
    } = service.group;

    logger.info(`Opening new payment channel [amount: ${amount}, expiry: ${expiryStr}]`, { tags: ['MPE'] });
    const openChannelOperation = this.contract.methods.openChannel;
    const openChannelFnArgs = [account.signerAddress, recipientAddress, groupId, amount, expiryStr];
    return account.sendTransaction(this.address, openChannelOperation, ...openChannelFnArgs);
  }

  /**
   * Deposits the specified tokens to MPE Account and opens a payment channel between an account and the given service
   * with the specified tokens and expiry period
   * @param {Account} account - The account against which the operations needs to be performed
   * @param {ServiceClient} service - The AI service between which the payment channel needs to be opened
   * @param {BigNumber} amountInCogs - The initial tokens with the which payment channel needs to be opened
   * @param {BigNumber} expiry - The expiry of the payment channel in terms of block number
   * @returns {Promise.<TransactionReceipt>}
   */
  async depositAndOpenChannel(account, service, amountInCogs, expiry) {
    const amount = toBNString(amountInCogs);
    const expiryStr = toBNString(expiry);
    const {
      payment_address: recipientAddress,
      group_id_in_bytes: groupId
    } = service.group;
    const alreadyApprovedAmount = await account.allowance();
    if(amountInCogs > alreadyApprovedAmount) {
      await account.approveTransfer(amountInCogs);
    }

    const depositAndOpenChannelOperation = this.contract.methods.depositAndOpenChannel;
    const operationArgs = [account.signerAddress, recipientAddress, groupId, amount, expiryStr];
    logger.info(`Depositing ${amount}cogs to MPE address and Opening new payment channel [expiry: ${expiryStr}]`, { tags: ['MPE'] });
    return account.sendTransaction(this.address, depositAndOpenChannelOperation, ...operationArgs);
  }

  /**
   * Funds an existing payment channel
   * @param {Account} account - The account against which the operations needs to be performed
   * @param {BigNumber} channelId - The payment channel id
   * @param {BigNumber} amountInCogs - The number of tokens to fund the channel
   * @returns {Promise.<TransactionReceipt>}
   */
  async channelAddFunds(account, channelId, amountInCogs) {
    const channelIdStr = toBNString(channelId);
    const amount = toBNString(amountInCogs);
    await this._fundEscrowAccount(account, amountInCogs);

    logger.info(`Funding PaymentChannel[id: ${channelIdStr}] with ${amount}cogs`, { tags: ['MPE'] });
    const channelAddFundsOperation = this.contract.methods.channelAddFunds;
    return account.sendTransaction(this.address, channelAddFundsOperation, channelIdStr, amount);
  }

  /**
   * Extends an existing payment channel
   * @param {Account} account - The account against which the operations needs to be performed
   * @param {BigNumber} channelId - The payment channel id
   * @param {BigNumber} expiry - The expiry in terms of block number to extend the channel
   * @returns {Promise.<TransactionReceipt>}
   */
  async channelExtend(account, channelId, expiry) {
    const channelIdStr = toBNString(channelId);
    const expiryStr = toBNString(expiry);
    logger.info(`Extending PaymentChannel[id: ${channelIdStr}]. New expiry is block# ${expiryStr}`, { tags: ['MPE'] });
    const channelExtendOperation = this.contract.methods.channelExtend;
    return account.sendTransaction(this.address, channelExtendOperation, channelIdStr, expiryStr);
  }

  /**
   * Extends and adds funds to an existing payment channel
   * @param {Account} account - The account against which the operations needs to be performed
   * @param {BigNumber} channelId - The payment channel id
   * @param {BigNumber} expiry - The expiry in terms of block number to extend the channel
   * @param {BigNumber} amountInCogs - The number of tokens to fund the channel
   * @returns {Promise.<TransactionReceipt>}
   */
  async channelExtendAndAddFunds(account, channelId, expiry, amountInCogs) {
    const channelIdStr = toBNString(channelId);
    const amount = toBNString(amountInCogs);
    const expiryStr = toBNString(expiry);
    await this._fundEscrowAccount(account, amountInCogs);

    logger.info(`Extending and Funding PaymentChannel[id: ${channelIdStr}] with amount: ${amount} and expiry: ${expiryStr}`, { tags: ['MPE'] });
    const channelExtendAndAddFundsOperation = this.contract.methods.channelExtendAndAddFunds;
    return account.sendTransaction(this.address, channelExtendAndAddFundsOperation, channelIdStr, expiryStr, amount);
  }

  /**
   * Claims unused tokens in a channel.
   * @param {Account} account - The account against which the operations needs to be performed
   * @param {BigNumber} channelId - Channel ID from which to claim the unused tokens
   * @returns {Promise.<TransactionReceipt>}
   */
  async channelClaimTimeout(account, channelId) {
    const channelIdStr = toBNString(channelId);
    logger.info(`Claiming unused funds from expired channel PaymentChannel[id: ${channelIdStr}]`, { tags: ['MPE'] });
    const channelClaimTimeoutOperation = this.contract.methods.channelClaimTimeout;
    return account.sendTransaction(this.address, channelClaimTimeoutOperation, channelIdStr);
  }

  /**
   * Fetches the latest state of the payment channel
   * @param {BigNumber} channelId - The payment channel id
   * @returns {Promise<any>} - The return value(s) of the smart contract method. If it returns a single value, it’s returned as is. If it has multiple return values they are returned as an object with properties and indices:
   */
  async channels(channelId) {
    const channelIdStr = toBNString(channelId);
    logger.debug(`Fetch latest PaymentChannel[id: ${channelIdStr}] state`, { tags: ['MPE'] });
    return this.contract.methods.channels(channelIdStr).call();
  }

  /**
   * Fetches all the payment channels opened between the account and the service starting from the given block number
   * @param {Account} account
   * @param {ServiceClient} service
   * @param {number} [startingBlockNumber=MPE Contract deployment block number] - The starting block number to fetch the
   * open channels from
   * @returns {Promise.<PaymentChannel[]>}
   */
  async getPastOpenChannels(account, service, startingBlockNumber) {
    const fromBlock = startingBlockNumber ? startingBlockNumber : await this._deploymentBlockNumber();
    logger.debug(`Fetching all payment channel open events starting at block: ${fromBlock}`, { tags: ['MPE'] });
    const address = await account.getAddress()
    const options = {
      filter: {
        sender: address,
        recipient: service.group.payment_address,
        groupId: service.group.group_id_in_bytes,
      },
      fromBlock,
      toBlock: 'latest'
    };
    const channelsOpened = await this.contract.getPastEvents('ChannelOpen', options);
    return map(channelsOpened, channelOpenEvent => {
      const channelId = channelOpenEvent.returnValues.channelId;
      return new PaymentChannel(channelId, this._web3, account, service, this);
    });
  }

  async _fundEscrowAccount(account, amountInCogs) {
    const address = await account.getAddress()
    const currentEscrowBalance = await this.balance(address);
    if(amountInCogs > currentEscrowBalance) {
      await account.depositToEscrowAccount(amountInCogs - currentEscrowBalance);
    }
  }

  async _deploymentBlockNumber() {
    const { transactionHash } = MPENetworks[this._networkId];
    const { blockNumber } = await this._web3.eth.getTransactionReceipt(transactionHash);
    return blockNumber;
  }
}

export default MPEContract;
