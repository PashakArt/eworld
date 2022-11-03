// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
const { ethers, network } = require("hardhat");
const DEPLOY_CONFIG = require("./deploy_config.json");
const delay = require("delay");
const fs = require("fs");
const path = require("path");
const OUTPUT_DEPLOY = require("./deployedContractOutput.json");

async function main() {
  const Eworld = await ethers.getContractFactory("EWorldStaking");
  const eworld = await Eworld.deploy(
    DEPLOY_CONFIG.goerli.tokenAddress,
    DEPLOY_CONFIG.development.abortStakingPenaltyPercents,
    DEPLOY_CONFIG.development.stakingMonthRewardPercents,
    DEPLOY_CONFIG.development.staking2MonthsRewardPercents,
    DEPLOY_CONFIG.development.stakingYearRewardPercents,
    DEPLOY_CONFIG.development.staking2YearsRewardPercents,
    DEPLOY_CONFIG.development.staking3YearsRewardPercents,
    DEPLOY_CONFIG.development.staking4YearsRewardPercents,
    DEPLOY_CONFIG.development.staking5YearsRewardPercents
  );

  await eworld.deployed();

  console.log("EWorldStaking deployed to:", eworld.address);

  await delay(70000);

  try {
    await hre.run("verify:verify", {
      address: eworld.address,
      constructorArguments: [
        DEPLOY_CONFIG.goerli.tokenAddress,
        DEPLOY_CONFIG.goerli.abortStakingPenaltyPercents,
        DEPLOY_CONFIG.goerli.stakingMonthRewardPercents,
        DEPLOY_CONFIG.goerli.staking2MonthsRewardPercents,
        DEPLOY_CONFIG.goerli.stakingYearRewardPercents,
        DEPLOY_CONFIG.goerli.staking2YearsRewardPercents,
        DEPLOY_CONFIG.goerli.staking3YearsRewardPercents,
        DEPLOY_CONFIG.goerli.staking4YearsRewardPercents,
        DEPLOY_CONFIG.goerli.staking5YearsRewardPercents,
      ],
    });
  } catch (error) {
    console.error(error);
  }

  console.log("Verification finished");
  console.log("Eworld deployed to: " + eworld.address);

  const baseEtherscan =
    network.name === "goerli"
      ? "https://goerli.etherscan.io/address/"
      : "https://etherscan.io/address/";

  OUTPUT_DEPLOY.networks[network.name].address = eworld.address;
  OUTPUT_DEPLOY.networks[network.name].verification =
    baseEtherscan + eworld.address + "#code";
  fs.writeFileSync(
    path.resolve(__dirname, "./deployedContractOutput.json"),
    JSON.stringify(OUTPUT_DEPLOY, null, "  ")
  );
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
