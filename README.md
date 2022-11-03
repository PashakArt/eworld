# Eworld Staking Contract

**Requirements**

- nodeJS v10.16.0 or later
- npm 6.14.15 or later

**Installation**

- npm i

**Run tests**

- npx hardhat test

**Contract functions**

**_User functions_**

StakingPeriod - enumirate which explain staking period:

```
0 - Invalid staking period. Forbiden for creating deposit. Only internal usage.
1 - 1 month.
2 - 2 months.
3 - 1 year.
4 - 2 years.
5 - 3 years.
6 - 4 years.
7 - 5 years.
```

```
function createDeposit(uint256 amount, StakingPeriod stakingPeriod) returns(uint256);
```

Create deposit with amount, and staking period. User must approve amount for contract address before.

Returns created deposit index.

```
function getDepositIndices(address account) returns(uint256 indices);
```

Function returns deposit indeces for specified user account.

```
function getDepositInfo(address account, uint256 index);
```

Function returns deposit info for specified user account and deposit index.
Returns:

```
{
    amount : BN,
    startTime: BN,
    period: BN,
    lastRewardsClaimTimestamp: BN,
    rewardsAmount: BN
}
```

```
function withdrawRewards(uint256 index);
```

User can take his rewards with cooldown 7 days. Function calculates available rewards and transfer it to account,
which opened this deposit. If contract contains remaining rewards less that available user rewards, it transfer remainder.

```
function withdrawDeposit(uint256 index)
```

User can close his deposit. Function calculates available rewards, calculates penalty (if target staking period wasn't reached)
and tranfer this amount to user account. If contract remaining rewards less that available user rewards, it transfer remainder.
If contract has no remaining rewards, contract doesn't take penalty.

**_Admin functions_**

```
function transferOwnership(address newOwner);
```

Function transfers ownership to new account. Can be called by current owner only.

```
function addRewards(uint256 amount);
```

Function adds rewards to contract address from admin account. Admin must approve amount for contract address.
Can be called by owner only.

```
function withdrawPenalty(uint256 amount);
```

Function withdraw penalty from contract to admin address.
Can be called by current owner only.
