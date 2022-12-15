# ETH Staking App

This smart contract is the implementation of the challenge set by GOGO Protocol. It contains smart contract implementation, tests and the deployment script.

## Smart contracts

In the contracts folder, there are 5 Solidity files:

- DevUSDC.sol contains simple implementation of DevUSDC token. It inherits ERC20 smart contract and adds public permissioned function for minting tokens. Permissions are managed through the base AccessControl contract.
- EthStakingApp.sol contains implementation of EthStakingApp and is the central smart contract. Justification of the implementation decisions, discussions around alternative approaches and possible improvements - all of that is written in the comments directly in the file, using NatSpec format.
- CEth.sol contains the minimum interface of cETH token needed by EthStakingApp.
- MockPriceFeed.sol and MockCeth.sol are mock smart contracts used for local testing. They mimic the behavior of Chainlink and Compound smart contracts with possibility to mock the data their method would return.

Beside these smart contracts, additional smart contracts from OpenZeppelin and Chainlink are required. They can be downloaded using npm and they are listed in package.json as required dependencies.

## Tests

All tests are written in EthStakingApp.js file in the test folder.

Challenge requirements described only one test case that should be implemented. That specific one is named "Should track correct devUSDC rewards and staked ETH balances" and is part of "Simultaneous deposits and withdrawals" test suite.

Additional 12 tests are written and they only cover the basic flows. They are added as the author wanted to make sure that the implementation of the EthStakingApp is correct and additionally, they contain pieces required by the test requested by the challenge. Finally, they show usage of different Hardhat, Mocha, Chai and ethers.js elements.

These 13 tests are not intended to fully cover the code and examine all the cases. In order to achieve that, additional parts of the code need to be tested (e.g. emitting events), test cases should contain abnormal values, values at the limits and large number of function calls. Popular attacks such as reentrancy attack should be attempted, but also tests should mimic unavailability of Compound's and Chainlink's smart contracts.

## Deployment

Code for deployment and Etherscan verification of the smart contracts is written in deploy.js script in the scripts folder.

Deployment function deploys devUSDC smart contract (without constructor parameters) and EthStakingApp smart contract. It also gives EthStakingApp minter role for devUSDC. cETH and PriceFeed contract addresses are written in this script (currently for Goerli) and they need to be adjusted for different networks before the deployment. They need to be hardcoded as Hardhat's "run" task doesn't support passing arguments to the script. In order to make it dynamic, implementation of the custom Hardhat task would be required. Finally, the script exports constructor parameters for EthStakingApp which are required for the verification of the smart contract on the Etherscan.

In order for deployment to work, following parameters in hardhat.config.js need to be inserted:

- <<INFURA_API_KEY>>
- <<DEPLOYER_PRIVATE_KEY>>
- <<ETHERSCAN_API_KEY>>

Improvement to the deployment process can be made in a way that these keys are stored in the local secrets file and dynamically read in the config file.

In order to deploy and verify smart contracts, following Hardhat tasks need to be run:

`npx hardhat run scripts/deploy.js --network goerli`

Replace devUSDC address in "devUSDCAddress" (line 3) in deploy.js script

`npx hardhat verify --contract contracts/DevUSDC.sol:DevUSDC <<devUSDCAddress>> --network goerli`

`npx hardhat verify --contract contracts/EthStakingApp.sol:EthStakingApp <<EthStakingAppAddress>> --network goerli --constructor-args scripts/deploy.js`

## Git

Implementation, tests and deployment scripts are committed in a single commit. In the real development cycle, it would be split into more granular commits.
