const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

const DEPLOY_CONFIG = require("../scripts/deploy_config.json");

const ownerBalance = ethers.utils.parseEther("100000000");
const userBalance = ethers.utils.parseEther("10000000");
const userDeposit = ethers.utils.parseEther("1000");
const totalRewards = ethers.utils.parseEther("15000000");

const StakingPeriod = {
  StakingPeriod0: 0,
  StakingPeriodMonth: 1,
  StakingPeriod2Months: 2,
  StakingPeriodYear: 3,
  StakingPeriod2Years: 4,
  StakingPeriod3Years: 5,
  StakingPeriod4Years: 6,
  StakingPeriod5Years: 7,
};

const percentsArr = [
  0,
  DEPLOY_CONFIG.development.stakingMonthRewardPercents,
  DEPLOY_CONFIG.development.staking2MonthsRewardPercents,
  DEPLOY_CONFIG.development.stakingYearRewardPercents,
  DEPLOY_CONFIG.development.staking2YearsRewardPercents,
  DEPLOY_CONFIG.development.staking3YearsRewardPercents,
  DEPLOY_CONFIG.development.staking4YearsRewardPercents,
  DEPLOY_CONFIG.development.staking5YearsRewardPercents,
];

describe("EWorld staking contract", () => {
  before(async () => {
    [this.owner, this.user] = await ethers.getSigners();
    this.onwerAddr = this.owner.getAddress();
    this.userAddr = this.user.getAddress();
  });

  beforeEach(async () => {
    this.token = await (
      await ethers.getContractFactory("MockERC20")
    ).deploy("Mock token", "Mock");
    this.eworld = await (
      await ethers.getContractFactory("EWorldStaking")
    ).deploy(
      this.token.address,
      DEPLOY_CONFIG.development.abortStakingPenaltyPercents,
      DEPLOY_CONFIG.development.stakingMonthRewardPercents,
      DEPLOY_CONFIG.development.staking2MonthsRewardPercents,
      DEPLOY_CONFIG.development.stakingYearRewardPercents,
      DEPLOY_CONFIG.development.staking2YearsRewardPercents,
      DEPLOY_CONFIG.development.staking3YearsRewardPercents,
      DEPLOY_CONFIG.development.staking4YearsRewardPercents,
      DEPLOY_CONFIG.development.staking5YearsRewardPercents
    );

    await this.token.mint(this.onwerAddr, ownerBalance);
    await this.token.connect(this.owner).mint(this.userAddr, userBalance);
    await this.token.approve(this.eworld.address, totalRewards);
    await this.eworld.addRewards(totalRewards);
  });

  describe("Test token parameters", () => {
    it("should return correct name", async () => {
      const name = await this.token.name();
      expect(name).to.be.equal("Mock token");
    });

    it("should return correct symbol", async () => {
      const symbol = await this.token.symbol();
      expect(symbol).to.be.equal("Mock");
    });

    it("should return correct decimals", async () => {
      const decimals = await this.token.decimals();
      expect(decimals).to.be.equal(ethers.BigNumber.from(18));
    });

    it("should return correct balances", async () => {
      let balance = await this.token.balanceOf(this.onwerAddr);
      expect(ethers.BigNumber.from(balance)).to.be.equal(
        ownerBalance.sub(totalRewards)
      );
      balance = await this.token.balanceOf(this.userAddr);
      expect(ethers.BigNumber.from(balance)).to.be.equal(userBalance);
      balance = await this.token.balanceOf(this.eworld.address);
      expect(ethers.BigNumber.from(balance)).to.be.equal(totalRewards);
    });
  });

  describe("Test contract params", () => {
    it("should return correct token address", async () => {
      const tokenAddress = await this.eworld.token();
      expect(tokenAddress).to.be.equal(this.token.address);
    });

    it("should return correct penalty percents", async () => {
      const penaltyPercents = await this.eworld.abortStakingPenaltyPercents();
      expect(ethers.BigNumber.from(penaltyPercents)).to.be.equal(
        ethers.BigNumber.from(
          DEPLOY_CONFIG.development.abortStakingPenaltyPercents
        )
      );
    });

    it("should return correct reward percents", async () => {
      for (let i = 0; i < percentsArr.length; i++) {
        const value = await this.eworld.stakingRewardPercents(i);
        expect(ethers.BigNumber.from(value)).to.be.equal(
          ethers.BigNumber.from(percentsArr[i])
        );
      }
    });

    it("should return correct avaible rewards", async () => {
      const rewards = await this.eworld.remainingRewardsAmount();
      expect(rewards).to.be.equal(totalRewards);
    });
  });

  describe("Test creating deposit", () => {
    it("should open new deposit", async () => {
      await this.token
        .connect(this.user)
        .approve(this.eworld.address, userDeposit);

      await this.eworld
        .connect(this.user)
        .createDeposit(userDeposit, StakingPeriod.StakingPeriod2Years);
      const blockTime = await time.latest();

      const index = await this.eworld.getDepositIndices(this.userAddr);
      expect(index).to.be.equal(1);

      const {
        amount,
        startTime,
        period,
        lastRewardsClaimTimestamp,
        rewardsAmount,
      } = await this.eworld.getDepositInfo(this.userAddr, 0);
      expect(ethers.BigNumber.from(amount)).to.be.equal(userDeposit);
      expect(startTime).to.be.equal(blockTime);
      expect(period).to.be.equal(StakingPeriod.StakingPeriod2Years);
      expect(rewardsAmount).to.be.equal(0);
    });
  });

  describe("Test withdraw rewards", () => {
    it("should stake correct rewards", async () => {
      const index = 0;
      await this.token
        .connect(this.user)
        .approve(this.eworld.address, userDeposit);
      await this.eworld
        .connect(this.user)
        .createDeposit(userDeposit, StakingPeriod.StakingPeriod2Years);

      let depositInfo = await this.eworld.getDepositInfo(this.userAddr, index);

      expect(depositInfo.startTime).to.be.equal(
        depositInfo.lastRewardsClaimTimestamp
      );
      expect(depositInfo.rewardsAmount).to.be.equal(index);
      // increase time for 40 days
      const timeWithdraw = (await time.latest()) + 60 * 60 * 24 * 40;
      await time.increaseTo(timeWithdraw);

      depositInfo = await this.eworld.getDepositInfo(this.userAddr, index);

      const monthRewardPercents =
        DEPLOY_CONFIG.development.stakingMonthRewardPercents;
      // calculate rewards
      const stakingDays = 40;
      const stakingPeriodDays = 30;
      // (amount * stakingDays * percentage) / stakingPeriodDays / 100
      const expectedRewards = userDeposit
        .mul(stakingDays)
        .mul(monthRewardPercents)
        .div(stakingPeriodDays)
        .div(100);

      expect(depositInfo.rewardsAmount).to.be.equal(expectedRewards);

      const userBalanceBefore = await this.token.balanceOf(this.userAddr);

      await this.eworld.connect(this.user).withdrawRewards(index);

      const userBalanceAfter = await this.token.balanceOf(this.userAddr);

      expect(userBalanceAfter).to.be.equal(
        userBalanceBefore.add(depositInfo.rewardsAmount)
      );
    });

    it("rewards can be claimed during all staking period", async () => {
      const index = 0;
      await this.token
        .connect(this.user)
        .approve(this.eworld.address, userDeposit);
      await this.eworld
        .connect(this.user)
        .createDeposit(userDeposit, StakingPeriod.StakingPeriod2Years);

      // // increase time for 40 days
      let timeWithdraw = (await time.latest()) + 60 * 60 * 24 * 40;
      await time.increaseTo(timeWithdraw);

      let depositInfo = await this.eworld.getDepositInfo(this.userAddr, index);

      let userBalanceBefore = await this.token.balanceOf(this.userAddr);

      await this.eworld.connect(this.user).withdrawRewards(index);

      let userBalanceAfter = await this.token.balanceOf(this.userAddr);

      expect(userBalanceAfter).to.be.equal(
        userBalanceBefore.add(depositInfo.rewardsAmount)
      );

      const rewardsClaimed = depositInfo.rewardsAmount;

      // increase time for 1 year
      timeWithdraw = (await time.latest()) + 60 * 60 * 24 * 365;
      await time.increaseTo(timeWithdraw);

      // calculate rewards for year period
      const yearRewardPercents =
        DEPLOY_CONFIG.development.stakingYearRewardPercents;
      const stakingDays = 405;
      const stakingPeriodDays = 365;
      // (amount * stakingDays * percentage) / stakingPeriodDays / 100
      let expectedRewards = userDeposit
        .mul(stakingDays)
        .mul(yearRewardPercents)
        .div(stakingPeriodDays)
        .div(100);
      expectedRewards = expectedRewards.sub(rewardsClaimed);

      depositInfo = await this.eworld.getDepositInfo(this.userAddr, index);

      expect(expectedRewards).to.be.equal(depositInfo.rewardsAmount);

      userBalanceBefore = await this.token.balanceOf(this.userAddr);

      await this.eworld.connect(this.user).withdrawRewards(index);

      userBalanceAfter = await this.token.balanceOf(this.userAddr);
      expect(userBalanceAfter).to.be.equal(
        userBalanceBefore.add(expectedRewards)
      );
    });

    it("should claim rewards with specified staking period percentage", async () => {
      const index = 0;
      await this.token
        .connect(this.user)
        .approve(this.eworld.address, userDeposit);
      await this.eworld
        .connect(this.user)
        .createDeposit(userDeposit, StakingPeriod.StakingPeriodYear);

      // increase time for 3 years
      const timeWithdraw = (await time.latest()) + 60 * 60 * 24 * 365 * 3;
      await time.increaseTo(timeWithdraw);

      // calculate rewards for 3 years, but with 1 year period percentage
      const yearRewardPercents =
        DEPLOY_CONFIG.development.stakingYearRewardPercents;
      const stakingDays = 365 * 3;
      const stakingPeriodDays = 365;
      // (amount * stakingDays * percentage) / stakingPeriodDays / 100
      const expectedRewards = userDeposit
        .mul(stakingDays)
        .mul(yearRewardPercents)
        .div(stakingPeriodDays)
        .div(100);

      const depositInfo = await this.eworld.getDepositInfo(
        this.userAddr,
        index
      );

      expect(expectedRewards).to.be.equal(depositInfo.rewardsAmount);

      const userBalanceBefore = await this.token.balanceOf(this.userAddr);

      await this.eworld.connect(this.user).withdrawRewards(index);

      const userBalanceAfter = await this.token.balanceOf(this.userAddr);
      expect(userBalanceAfter).to.be.equal(
        userBalanceBefore.add(expectedRewards)
      );
    });

    it("rewards can be taken once of 7 days", async () => {
      const index = 0;
      await this.token
        .connect(this.user)
        .approve(this.eworld.address, userDeposit);
      await this.eworld
        .connect(this.user)
        .createDeposit(userDeposit, StakingPeriod.StakingPeriodYear);

      // increase time for 40 days
      let timeWithdraw = (await time.latest()) + 60 * 60 * 24 * 40;
      await time.increaseTo(timeWithdraw);

      const depositInfo = await this.eworld.getDepositInfo(
        this.userAddr,
        index
      );

      const userBalanceBefore = await this.token.balanceOf(this.userAddr);

      await this.eworld.connect(this.user).withdrawRewards(index);

      const userBalanceAfter = await this.token.balanceOf(this.userAddr);

      expect(userBalanceAfter).to.be.equal(
        userBalanceBefore.add(depositInfo.rewardsAmount)
      );

      // // increase time for 6 days
      timeWithdraw = (await time.latest()) + 60 * 60 * 24 * 6;
      await time.increaseTo(timeWithdraw);

      await expect(
        this.eworld.connect(this.user).withdrawRewards(index)
      ).to.be.revertedWith("Must wait cooldown since last reward claiming");
    });

    it("if not enough rewards must withdraw residue", async () => {
      const index = 0;
      await this.token
        .connect(this.user)
        .approve(this.eworld.address, userBalance);
      await this.eworld
        .connect(this.user)
        .createDeposit(userBalance, StakingPeriod.StakingPeriod5Years);

      // increase time for 2 years
      let timeWithdraw = (await time.latest()) + 60 * 60 * 24 * 365 * 2;
      await time.increaseTo(timeWithdraw);

      let depositInfo = await this.eworld.getDepositInfo(this.userAddr, index);

      expect(depositInfo.rewardsAmount).to.be.equal(totalRewards);

      const userBalanceBefore = await this.token.balanceOf(this.userAddr);
      await this.eworld.connect(this.user).withdrawRewards(index);

      const userBalanceAfter = await this.token.balanceOf(this.userAddr);
      expect(userBalanceAfter).to.be.equal(userBalanceBefore.add(totalRewards));

      const remainingRewards = await this.eworld.remainingRewardsAmount();
      expect(remainingRewards).to.be.equal(0);

      // increase time for 1 years
      timeWithdraw = (await time.latest()) + 60 * 60 * 24 * 365;
      await time.increaseTo(timeWithdraw);

      depositInfo = await this.eworld.getDepositInfo(this.userAddr, index);

      expect(depositInfo.rewardsAmount).to.be.equal(0);

      // next withdrawing must be reverted
      await expect(
        this.eworld.connect(this.user).withdrawRewards(index)
      ).to.be.revertedWith("No more rewards");
    });
  });

  describe("Test closing deposit", () => {
    it("should close deposit and return rewards without penalty", async () => {
      const index = 0;
      await this.token
        .connect(this.user)
        .approve(this.eworld.address, userDeposit);
      await this.eworld
        .connect(this.user)
        .createDeposit(userDeposit, StakingPeriod.StakingPeriodYear);

      // increase time for 1 year and 1 month
      const timeWithdraw = (await time.latest()) + 60 * 60 * 24 * 395;
      await time.increaseTo(timeWithdraw);

      // calculate rewards for 1 year
      const yearRewardPercents =
        DEPLOY_CONFIG.development.stakingYearRewardPercents;
      const stakingDays = 395;
      const stakingPeriodDays = 365;
      // (amount * stakingDays * percentage) / stakingPeriodDays / 100
      const expectedRewards = userDeposit
        .mul(stakingDays)
        .mul(yearRewardPercents)
        .div(stakingPeriodDays)
        .div(100);

      const depositInfo = await this.eworld.getDepositInfo(
        this.userAddr,
        index
      );

      expect(depositInfo.rewardsAmount).to.be.equal(expectedRewards);

      const userBalanceBefore = await this.token.balanceOf(this.userAddr);
      await this.eworld.connect(this.user).withdrawDeposit(index);

      const userBalanceAfter = await this.token.balanceOf(this.userAddr);

      expect(userBalanceAfter).to.be.equal(
        userBalanceBefore.add(userDeposit).add(expectedRewards)
      );
    });

    it("should close deposit and return rewards with penalty", async () => {
      const index = 0;
      await this.token
        .connect(this.user)
        .approve(this.eworld.address, userDeposit);
      await this.eworld
        .connect(this.user)
        .createDeposit(userDeposit, StakingPeriod.StakingPeriodYear);

      // increase time for 1 month
      const timeWithdraw = (await time.latest()) + 60 * 60 * 24 * 30;
      await time.increaseTo(timeWithdraw);

      // calculate rewards for 1 month
      const rewardPercents =
        DEPLOY_CONFIG.development.stakingMonthRewardPercents;
      const stakingDays = 30;
      const stakingPeriodDays = 30;
      // (amount * stakingDays * percentage) / stakingPeriodDays / 100
      const expectedRewards = userDeposit
        .mul(stakingDays)
        .mul(rewardPercents)
        .div(stakingPeriodDays)
        .div(100);

      const depositInfo = await this.eworld.getDepositInfo(
        this.userAddr,
        index
      );

      expect(depositInfo.rewardsAmount).to.be.equal(expectedRewards);

      const userBalanceBefore = await this.token.balanceOf(this.userAddr);
      await this.eworld.connect(this.user).withdrawDeposit(index);

      const userBalanceAfter = await this.token.balanceOf(this.userAddr);
      const penaltyPercents =
        DEPLOY_CONFIG.development.abortStakingPenaltyPercents;
      const penalty = userDeposit.mul(penaltyPercents).div(100);

      expect(userBalanceAfter).to.be.equal(
        userBalanceBefore.add(userDeposit).add(expectedRewards).sub(penalty)
      );

      const contractPenalty = await this.eworld.totalPenalty();
      expect(contractPenalty).to.be.equal(penalty);
    });

    it("only owner can withdraw penalty", async () => {
      const index = 0;
      await this.token
        .connect(this.user)
        .approve(this.eworld.address, userDeposit);
      await this.eworld
        .connect(this.user)
        .createDeposit(userDeposit, StakingPeriod.StakingPeriodYear);

      // increase time for 1 month
      const timeWithdraw = (await time.latest()) + 60 * 60 * 24 * 30;
      await time.increaseTo(timeWithdraw);

      await this.eworld.connect(this.user).withdrawDeposit(index);

      const contractPenalty = await this.eworld.totalPenalty();

      await expect(
        this.eworld.connect(this.user).withdrawPenalty(contractPenalty)
      ).to.be.revertedWith("Ownable: caller is not the owner");

      await expect(
        this.eworld.withdrawPenalty(contractPenalty.add(1))
      ).to.be.revertedWith("Insufficient penalty amount");

      const balanceBefore = await this.token.balanceOf(this.onwerAddr);
      await this.eworld.withdrawPenalty(contractPenalty);

      const balanceAfter = await this.token.balanceOf(this.onwerAddr);
      expect(balanceAfter).to.be.equal(balanceBefore.add(contractPenalty));
    });
  });
});
