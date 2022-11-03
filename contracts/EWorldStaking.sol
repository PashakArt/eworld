// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract EWorldStaking is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum StakingPeriod {
        StakingPeriodInvalid,
        StakingPeriodMonth,
        StakingPeriod2Months,
        StakingPeriodYear,
        StakingPeriod2Years,
        StakingPeriod3Years,
        StakingPeriod4Years,
        StakingPeriod5Years
    }

    struct Deposit {
        uint256 amount;
        uint256 startTime;
        StakingPeriod stakingPeriod;
        uint256 rewardsClaimed;
        uint256 lastRewardsClaimTimestamp;
    }

    uint256 private constant durationMonth = 30 days;
    uint256 private constant duration2Months = 60 days;
    uint256 private constant durationYear = 365 days;
    uint256 private constant duration2Years = durationYear * 2;
    uint256 private constant duration3Years = durationYear * 3;
    uint256 private constant duration4Years = durationYear * 4;
    uint256 private constant duration5Years = durationYear * 5;

    uint public constant rewardsClamingCooldown = 7 days;

    uint256 public remainingRewardsAmount;

    IERC20 public token;
    uint32 public abortStakingPenaltyPercents;
    uint256 public totalPenalty;
    uint32[8] public stakingRewardPercents;
    mapping(address => Deposit[]) public deposits;

    event DepositCreate(
        address account,
        uint256 index,
        uint256 amount,
        StakingPeriod stakingPeriod
    );
    event RewardWithdraw(address account, uint256 index, uint256 reward);
    event DepositWithdraw(address account, uint256 index);
    event AddRewards(uint256 amount);

    constructor(
        IERC20 token_,
        uint32 abortStakingPenaltyPercents_,
        uint32 stakingMonthRewardPercents_,
        uint32 staking2MonthsRewardPercents_,
        uint32 stakingYearRewardPercents_,
        uint32 staking2YearsRewardPercents_,
        uint32 staking3YearsRewardPercents_,
        uint32 staking4YearsRewardPercents_,
        uint32 staking5YearsRewardPercents_
    ) {
        require(address(token_) != address(0), "Zero address");
        token = token_;
        abortStakingPenaltyPercents = abortStakingPenaltyPercents_;
        stakingRewardPercents[uint(StakingPeriod.StakingPeriodInvalid)] = 0;
        stakingRewardPercents[
            uint(StakingPeriod.StakingPeriodMonth)
        ] = stakingMonthRewardPercents_;
        stakingRewardPercents[
            uint(StakingPeriod.StakingPeriod2Months)
        ] = staking2MonthsRewardPercents_;
        stakingRewardPercents[
            uint(StakingPeriod.StakingPeriodYear)
        ] = stakingYearRewardPercents_;
        stakingRewardPercents[
            uint(StakingPeriod.StakingPeriod2Years)
        ] = staking2YearsRewardPercents_;
        stakingRewardPercents[
            uint(StakingPeriod.StakingPeriod3Years)
        ] = staking3YearsRewardPercents_;
        stakingRewardPercents[
            uint(StakingPeriod.StakingPeriod4Years)
        ] = staking4YearsRewardPercents_;
        stakingRewardPercents[
            uint(StakingPeriod.StakingPeriod5Years)
        ] = staking5YearsRewardPercents_;
    }

    function getDepositIndices(address account)
        external
        view
        returns (uint256 indices)
    {
        require(account != address(0), "Zero address");
        indices = deposits[account].length;
    }

    function getDepositInfo(address account, uint256 index)
        public
        view
        returns (
            uint256 amount,
            uint256 startTime,
            StakingPeriod period,
            uint256 lastRewardsClaimTimestamp,
            uint256 rewardsAmount
        )
    {
        require(account != address(0), "Zero address");
        require(deposits[account].length >= index, "Invalid index");
        amount = deposits[account][index].amount;
        startTime = deposits[account][index].startTime;
        period = deposits[account][index].stakingPeriod;
        lastRewardsClaimTimestamp = deposits[account][index]
            .lastRewardsClaimTimestamp;
        uint256 rewards = calculateRewardsAmount(deposits[account][index]);
        rewardsAmount = rewards > remainingRewardsAmount
            ? remainingRewardsAmount
            : rewards;
    }

    function addRewards(uint256 amount) external onlyOwner {
        token.safeTransferFrom(msg.sender, address(this), amount);
        remainingRewardsAmount += amount;
        emit AddRewards(amount);
    }

    function withdrawPenalty(uint256 amount) external onlyOwner {
        require(totalPenalty >= amount, "Insufficient penalty amount");
        totalPenalty -= amount;
        token.safeTransfer(msg.sender, amount);
    }

    function createDeposit(uint256 amount, StakingPeriod stakingPeriod)
        external
        nonReentrant
        returns (uint256)
    {
        require(
            deposits[msg.sender].length != ~uint256(0),
            "No free slots for deposit"
        );
        require(
            stakingPeriod > StakingPeriod.StakingPeriodInvalid &&
                stakingPeriod <= StakingPeriod.StakingPeriod5Years,
            "Invalid staking period"
        );

        token.safeTransferFrom(msg.sender, address(this), amount);

        Deposit memory deposit = Deposit(
            amount,
            block.timestamp,
            stakingPeriod,
            0,
            block.timestamp
        );

        deposits[msg.sender].push(deposit);
        uint256 index = deposits[msg.sender].length - 1;
        emit DepositCreate(msg.sender, index, amount, stakingPeriod);
        return index;
    }

    function getDurationByStakingPeriod(StakingPeriod period)
        internal
        pure
        returns (uint256)
    {
        if (period == StakingPeriod.StakingPeriodMonth) {
            return durationMonth;
        } else if (period == StakingPeriod.StakingPeriod2Months) {
            return duration2Months;
        } else if (period == StakingPeriod.StakingPeriodYear) {
            return durationYear;
        } else if (period == StakingPeriod.StakingPeriod2Years) {
            return duration2Years;
        } else if (period == StakingPeriod.StakingPeriod3Years) {
            return duration3Years;
        } else if (period == StakingPeriod.StakingPeriod4Years) {
            return duration4Years;
        } else if (period == StakingPeriod.StakingPeriod5Years) {
            return duration5Years;
        } else {
            return ~uint256(0);
        }
    }

    function getReachedStakingPeriod(uint256 stakingDuration)
        internal
        pure
        returns (StakingPeriod)
    {
        if (stakingDuration >= duration5Years) {
            return StakingPeriod.StakingPeriod5Years;
        } else if (stakingDuration >= duration4Years) {
            return StakingPeriod.StakingPeriod4Years;
        } else if (stakingDuration >= duration3Years) {
            return StakingPeriod.StakingPeriod3Years;
        } else if (stakingDuration >= duration2Years) {
            return StakingPeriod.StakingPeriod2Years;
        } else if (stakingDuration >= durationYear) {
            return StakingPeriod.StakingPeriodYear;
        } else if (stakingDuration >= duration2Months) {
            return StakingPeriod.StakingPeriod2Months;
        } else if (stakingDuration >= durationMonth) {
            return StakingPeriod.StakingPeriodMonth;
        } else {
            return StakingPeriod.StakingPeriodInvalid;
        }
    }

    function calculateRewardsAmount(Deposit memory deposit)
        internal
        view
        returns (uint256 amount)
    {
        bool targetPeriodIsReached = (block.timestamp - deposit.startTime) >=
            getDurationByStakingPeriod(deposit.stakingPeriod);
        uint stakingDays = (block.timestamp - deposit.startTime) / 1 days;
        StakingPeriod reachedPeriod;
        if (targetPeriodIsReached) {
            reachedPeriod = deposit.stakingPeriod;
        } else {
            reachedPeriod = getReachedStakingPeriod(
                block.timestamp - deposit.startTime
            );
        }
        if (reachedPeriod == StakingPeriod.StakingPeriodInvalid) {
            amount = 0;
        } else {
            amount =
                (deposit.amount *
                    stakingRewardPercents[uint(reachedPeriod)] *
                    stakingDays) /
                (getDurationByStakingPeriod(reachedPeriod) / 1 days) /
                100;
            amount = amount > deposit.rewardsClaimed
                ? amount - deposit.rewardsClaimed
                : 0;
        }
    }

    function withdrawRewards(uint256 index) external {
        require(remainingRewardsAmount > 0, "No more rewards");
        require(deposits[msg.sender].length >= index, "Invalid index");
        require(
            block.timestamp -
                deposits[msg.sender][index].lastRewardsClaimTimestamp >=
                rewardsClamingCooldown,
            "Must wait cooldown since last reward claiming"
        );

        uint256 rewardsAmount = calculateRewardsAmount(
            deposits[msg.sender][index]
        );

        require(rewardsAmount > 0, "No rewards available");

        if (rewardsAmount > remainingRewardsAmount) {
            rewardsAmount = remainingRewardsAmount;
        }

        remainingRewardsAmount -= rewardsAmount;
        deposits[msg.sender][index].rewardsClaimed += rewardsAmount;
        deposits[msg.sender][index].lastRewardsClaimTimestamp = block.timestamp;

        token.safeTransfer(msg.sender, rewardsAmount);
        emit RewardWithdraw(msg.sender, index, rewardsAmount);
    }

    function withdrawDeposit(uint256 index) external {
        require(deposits[msg.sender].length >= index, "index out of bound");
        bool targetPeriodIsReached = (block.timestamp -
            deposits[msg.sender][index].startTime) >=
            getDurationByStakingPeriod(
                deposits[msg.sender][index].stakingPeriod
            );
        uint256 rewardsAmount = calculateRewardsAmount(
            deposits[msg.sender][index]
        );

        if (rewardsAmount > remainingRewardsAmount) {
            rewardsAmount = remainingRewardsAmount;
        }

        uint256 amount = deposits[msg.sender][index].amount + rewardsAmount;
        if (!targetPeriodIsReached && (remainingRewardsAmount != 0)) {
            uint256 penalty = (deposits[msg.sender][index].amount *
                abortStakingPenaltyPercents) / 100;
            amount -= penalty;
            totalPenalty += penalty;
        }

        remainingRewardsAmount -= rewardsAmount;

        for (uint i = index; i < deposits[msg.sender].length - 1; i++) {
            deposits[msg.sender][i] = deposits[msg.sender][i + 1];
        }
        deposits[msg.sender].pop();

        token.safeTransfer(msg.sender, amount);
        emit DepositWithdraw(msg.sender, index);
    }
}
