require("@nomicfoundation/hardhat-toolbox");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.17",
  networks: {
    goerli: {
      url : "https://goerli.infura.io/v3/<<INFURA_API_KEY>>",
      accounts: ["<<DEPLOYER_PRIVATE_KEY>>"],
      maxFeePerGas: 30000000000,
      maxPriorityFeePerGas: 1000000000
    }
  },
  etherscan: {
    apiKey : {
      goerli: "<<ETHERSCAN_API_KEY>>"
    }
  }
};
