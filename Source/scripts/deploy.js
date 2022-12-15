const ethUsdPriceAggregator = "0xD4a33860578De61DBAbDc8BFdb98FD742fA7028e";
const cEthAddress = "0x64078a6189Bf45f80091c6Ff2fCEe1B15Ac8dbde";
const devUSDCAddress = "0x1147A3299B431A8A5F3bF42C0f4fCC91BB0fdeB0"

//constructor args for verification
module.exports = [devUSDCAddress, ethUsdPriceAggregator, cEthAddress ];

async function main() {
    const DevUSDC = await ethers.getContractFactory("DevUSDC");
    const usdc = await DevUSDC.deploy();
    await usdc.deployed();
    console.log(`devUSDC deployed to ${usdc.address}`);

    const EthStakingApp = await ethers.getContractFactory("EthStakingApp");
    const app = await EthStakingApp.deploy(usdc.address, ethUsdPriceAggregator, cEthAddress);
    await app.deployed();
    console.log(`Staking app deployed to ${app.address}`);

    const minterRole = ethers.utils.id("MINTER_ROLE");
    await usdc.grantRole(minterRole, app.address);
    console.log(`Minter role granted to ${app.address}`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
