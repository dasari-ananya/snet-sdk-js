import { find } from 'lodash';

export default class ChannelManagementStrategy {
  async selectChannel(serviceClient, sdk) {
    const account = sdk.account;
    const paymentChannels = serviceClient.paymentChannels;
    const serviceCallPrice = serviceClient.metadata.pricing.price_in_cogs;
    const mpeBalance = await account.escrowBalance();
    const defaultExpiration = await serviceClient.defaultChannelExpiration();

    if(paymentChannels.length === 0) {
      if(mpeBalance > serviceCallPrice) {
        return serviceClient.openChannel(serviceCallPrice, defaultExpiration);
      }

      return serviceCallPrice.depositAndOpenChannel(serviceCallPrice, defaultExpiration);
    }

    const firstFundedValidChannel = find(paymentChannels, (paymentChanel) => paymentChanel.hasSufficientFunds(serviceCallPrice) && paymentChanel.isValid(defaultExpiration));
    if(firstFundedValidChannel) {
      return firstFundedValidChannel;
    }

    const firstFundedChannel = find(paymentChannels, (paymentChanel) => paymentChanel.hasSufficientFunds(serviceCallPrice));
    if(firstFundedChannel) {
      await firstFundedChannel.extendExpiration(defaultExpiration);
      return firstFundedChannel;
    }

    const firstValidChannel = find(paymentChannels, (paymentChanel) => paymentChanel.isValid(defaultExpiration));
    if(firstValidChannel) {
      await firstValidChannel.addFunds(serviceCallPrice);
      return firstValidChannel;
    }

    const firstExpiredAndUnfundedChannel = paymentChannels[0];
    await firstExpiredAndUnfundedChannel.extendAndAddFunds(defaultExpiration, serviceCallPrice);
    return firstExpiredAndUnfundedChannel;
  }
}
