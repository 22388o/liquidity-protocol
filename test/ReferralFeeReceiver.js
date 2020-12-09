const { ether, time } = require('@openzeppelin/test-helpers');
const constants = require('@openzeppelin/test-helpers/src/constants');
const { expect } = require('chai');
const { trackReceivedToken, timeIncreaseTo } = require('./helpers/utils.js');

const Mooniswap = artifacts.require('Mooniswap');
const MooniswapDeployer = artifacts.require('MooniswapDeployer');
const MooniswapFactory = artifacts.require('MooniswapFactory');
const ReferralFeeReceiver = artifacts.require('ReferralFeeReceiver');
const TokenMock = artifacts.require('TokenMock');

contract('ReferralFeeReceiver', function ([wallet1, wallet2]) {
    beforeEach(async function () {
        this.DAI = await TokenMock.new('DAI', 'DAI', 18);
        this.token = await TokenMock.new('INCH', 'INCH', 18);
        this.deployer = await MooniswapDeployer.new();
        this.factory = await MooniswapFactory.new(wallet1, this.deployer.address, wallet1);
        this.feeReceiver = await ReferralFeeReceiver.new(this.token.address, this.factory.address);
        await this.factory.setReferralFeeReceiver(this.feeReceiver.address);
        await this.feeReceiver.updatePathWhitelist(constants.ZERO_ADDRESS, true);

        this.factory.notifyStakeChanged(wallet1, '1');
        await this.factory.defaultFeeVote(ether('0.1'));
        await timeIncreaseTo((await time.latest()).addn(86500));

        await this.factory.deploy(constants.ZERO_ADDRESS, this.DAI.address);
        this.mooniswap = await Mooniswap.at(await this.factory.pools(constants.ZERO_ADDRESS, this.DAI.address));

        await this.factory.deploy(constants.ZERO_ADDRESS, this.token.address);
        this.tokenMooniswap = await Mooniswap.at(await this.factory.pools(constants.ZERO_ADDRESS, this.token.address));

        await this.DAI.mint(wallet1, ether('270'));
        await this.DAI.approve(this.mooniswap.address, ether('270'));
        await this.mooniswap.deposit([ether('1'), ether('270')], ['0', '0'], { value: ether('1'), from: wallet1 });

        await this.token.mint(wallet1, ether('100'));
        await this.token.approve(this.tokenMooniswap.address, ether('100'));
        await this.tokenMooniswap.deposit([ether('1'), ether('100')], ['0', '0'], { value: ether('1'), from: wallet1 });

        await timeIncreaseTo((await time.latest()).addn(86500));
    });

    it('test', async function () {
        await this.mooniswap.swap(constants.ZERO_ADDRESS, this.DAI.address, ether('1'), '0', wallet1, { value: ether('1'), from: wallet2 });
        await timeIncreaseTo((await time.latest()).add(await this.mooniswap.decayPeriod()));
        await this.feeReceiver.freezeEpoch(this.mooniswap.address);
        await timeIncreaseTo((await time.latest()).add(await this.mooniswap.decayPeriod()));
        await this.feeReceiver.trade(this.mooniswap.address, [constants.ZERO_ADDRESS, this.token.address]);
        await timeIncreaseTo((await time.latest()).add(await this.mooniswap.decayPeriod()));
        await this.feeReceiver.trade(this.mooniswap.address, [this.DAI.address, constants.ZERO_ADDRESS, this.token.address]);
        await timeIncreaseTo((await time.latest()).add(await this.mooniswap.decayPeriod()));

        let received = await trackReceivedToken(
            this.token,
            wallet1,
            () => this.feeReceiver.claim([]),
        );
        expect(received).to.be.bignumber.equal('0');

        received = await trackReceivedToken(
            this.token,
            wallet1,
            () => this.feeReceiver.claim([this.mooniswap.address]),
        );
        expect(received).to.be.bignumber.equal('768280189852540105');

        const { firstUnprocessedEpoch, currentEpoch } = await this.feeReceiver.tokenInfo(this.mooniswap.address);
        expect(firstUnprocessedEpoch).to.be.bignumber.equal('1');
        expect(currentEpoch).to.be.bignumber.equal('1');
    });

    it('empty freeze', async function () {
        await this.feeReceiver.freezeEpoch(this.mooniswap.address);
        await timeIncreaseTo((await time.latest()).add(await this.mooniswap.decayPeriod()));
        await this.feeReceiver.trade(this.mooniswap.address, [constants.ZERO_ADDRESS, this.token.address]);
        await timeIncreaseTo((await time.latest()).add(await this.mooniswap.decayPeriod()));
        await this.feeReceiver.trade(this.mooniswap.address, [this.DAI.address, constants.ZERO_ADDRESS, this.token.address]);
        await timeIncreaseTo((await time.latest()).add(await this.mooniswap.decayPeriod()));
        const { firstUnprocessedEpoch, currentEpoch } = await this.feeReceiver.tokenInfo(this.mooniswap.address);
        expect(firstUnprocessedEpoch).to.be.bignumber.equal('1');
        expect(currentEpoch).to.be.bignumber.equal('1');
    });
});