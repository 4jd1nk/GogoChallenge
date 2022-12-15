const {
    time,
    loadFixture,
  } = require("@nomicfoundation/hardhat-network-helpers");
  const { expect } = require("chai");
  const { ethers } = require("hardhat");
  
describe("EthStakingApp", function () {
    const initialEthPrice =  ethers.utils.parseUnits("1300", 8);
    const accruedInterest = ethers.utils.parseEther("1");

    async function getEthPrice(priceFeed) {
        const { roundId, answer, startedAt, updatedAt, answeredInRound } = await priceFeed.latestRoundData();
        return answer;
    }

    async function deployFixture() {
        const [owner, account1, account2] = await ethers.getSigners();

        const PriceFeed = await ethers.getContractFactory("MockPriceFeed");
        const priceFeed = await PriceFeed.deploy(initialEthPrice);

        const CETH = await ethers.getContractFactory("MockCEth");
        const cEth = await CETH.deploy({ value: accruedInterest });

        const DevUSDC = await ethers.getContractFactory("DevUSDC");
        const usdc = await DevUSDC.deploy();

        const EthStakingApp = await ethers.getContractFactory("EthStakingApp");
        const app = await EthStakingApp.deploy(usdc.address, priceFeed.address, cEth.address);

        const minterRole = ethers.utils.id("MINTER_ROLE");
        await usdc.grantRole(minterRole, app.address);

        return { app, owner, account1, account2, usdc };
    }
  
    describe("Deployment", function () {
        it("Should set correct mock data", async function () {
            const { app, owner, account1, account2 } = await loadFixture(deployFixture);

            const priceFeed = await hre.ethers.getContractAt("MockPriceFeed", await app._priceFeed());
            const ethPrice = await getEthPrice(priceFeed);

            expect(await app._totalStakedAmount()).to.equal(ethers.BigNumber.from(0));
            expect(ethPrice).to.equal(initialEthPrice);

            expect(await ethers.provider.getBalance((await app._cEth()))).to.equal(accruedInterest);
        });
    });

    describe("Deposits", function () {
        it("Should allow deposits", async function () {
            const { app, owner, account1, account2 } = await loadFixture(deployFixture);

            const ethAmount1 = ethers.utils.parseEther("10");
            const ethAmount2 = ethers.utils.parseEther("15");

            expect(await app.getStakedAmount(account1.address)).to.equal(ethers.BigNumber.from(0));
            expect(await app.getStakedAmount(account2.address)).to.equal(ethers.BigNumber.from(0));

            await app.connect(account1).deposit({value: ethAmount1});
            await app.connect(account2).deposit({value: ethAmount2});

            expect(await app.getStakedAmount(account1.address)).to.equal(ethAmount1);
            expect(await app.getStakedAmount(account2.address)).to.equal(ethAmount2); 
            expect(await app._totalStakedAmount()).to.equal(ethAmount1.add(ethAmount2));           
        });

        it("Should allow multiple deposits", async function () {
            const { app, owner, account1, account2 } = await loadFixture(deployFixture);

            const ethAmount1 = ethers.utils.parseEther("10");
            const ethAmount2 = ethers.utils.parseEther("15");
            const ethAmount3 = ethers.utils.parseEther("8");

            await app.connect(account1).deposit({value: ethAmount1});
            await app.connect(account2).deposit({value: ethAmount2});

            expect(await app.getStakedAmount(account1.address)).to.equal(ethAmount1);
            expect(await app.getStakedAmount(account2.address)).to.equal(ethAmount2); 

            await app.connect(account1).deposit({value: ethAmount3});

            expect(await app.getStakedAmount(account1.address)).to.equal(ethAmount1.add(ethAmount3));
            expect(await app.getStakedAmount(account2.address)).to.equal(ethAmount2);     
            expect(await app._totalStakedAmount()).to.equal(ethAmount1.add(ethAmount2).add(ethAmount3));         
        });

        it("Should pass the deposits to Compound and not keep in the app", async function () {
            const { app, owner, account1, account2 } = await loadFixture(deployFixture);

            const ethAmount1 = ethers.utils.parseEther("10");
            const ethAmount2 = ethers.utils.parseEther("15");

            await app.connect(account1).deposit({value: ethAmount1});
            await app.connect(account2).deposit({value: ethAmount2});

            expect(await app.getStakedAmount(account1.address)).to.equal(ethAmount1);
            expect(await app.getStakedAmount(account2.address)).to.equal(ethAmount2);    
            
            expect(await ethers.provider.getBalance((await app._cEth())))
                .to.equal(accruedInterest.add(ethAmount1).add(ethAmount2));
            expect(await ethers.provider.getBalance(app.address)).to.equal(ethers.BigNumber.from(0));
        });

        it("Should revert when depositing amount smaller than 5 ETH", async function () {
            const { app, owner, account1, account2 } = await loadFixture(deployFixture);

            const ethAmount1 = ethers.utils.parseEther("5.999999999999999999");
            const ethAmount2 = ethers.utils.parseEther("4.999999999999999999");

            expect(await app.getStakedAmount(account1.address)).to.equal(ethers.BigNumber.from(0));
            expect(await app.getStakedAmount(account2.address)).to.equal(ethers.BigNumber.from(0));

            await app.connect(account1).deposit({value: ethAmount1});
            await expect(app.connect(account2).deposit({value: ethAmount2})).to.be.reverted;

            expect(await app.getStakedAmount(account1.address)).to.equal(ethAmount1);
            expect(await app.getStakedAmount(account2.address)).to.equal(ethers.BigNumber.from(0));            
        });
    });

    describe("Withdrawals", function () {
        it("Should return expected ETH amount and some devUSDC when withdrawing", async function () {
            const { app, owner, account1, account2, usdc } = await loadFixture(deployFixture);

            const ethAmount1 = ethers.utils.parseEther("10");
            const ethAmount2 = ethers.utils.parseEther("15");

            await app.connect(account1).deposit({value: ethAmount1});
            await app.connect(account2).deposit({value: ethAmount2});

            const oneYear = 365 * 24 * 60 * 60;
            await time.increase(oneYear);

            const ethBalance1Before = await ethers.provider.getBalance(account1.address);
            const ethBalance2Before = await ethers.provider.getBalance(account2.address);

            const devUsdcBalance1Before = await usdc.balanceOf(account1.address);
            const devUsdcBalance2Before = await usdc.balanceOf(account2.address);

            const expectedReward1 = await app.getEarnedReward(account1.address);
            const expectedReward2 = await app.getEarnedReward(account2.address);

            const tx1 = await (await app.connect(account1).withdraw()).wait();  
            const tx2 = await (await app.connect(account2).withdraw()).wait(); 

            const withdraw1GasFee = tx1.cumulativeGasUsed.mul(tx1.effectiveGasPrice);
            const withdraw2GasFee = tx2.cumulativeGasUsed.mul(tx2.effectiveGasPrice);

            expect(await app.getStakedAmount(account1.address)).to.equal(ethers.BigNumber.from(0));
            expect(await app.getStakedAmount(account2.address)).to.equal(ethers.BigNumber.from(0)); 

            expect(await usdc.balanceOf(account1.address)).to.be.above(devUsdcBalance1Before.add(expectedReward1));
            expect(await usdc.balanceOf(account2.address)).to.be.above(devUsdcBalance2Before.add(expectedReward2));

            expect(await ethers.provider.getBalance(account1.address)).to.equal(ethBalance1Before.add(ethAmount1).sub(withdraw1GasFee));
            expect(await ethers.provider.getBalance(account2.address)).to.equal(ethBalance2Before.add(ethAmount2).sub(withdraw2GasFee));   

            expect(await ethers.provider.getBalance((await app._cEth()))).to.equal(accruedInterest); 
            expect(await ethers.provider.getBalance(app.address)).to.equal(ethers.BigNumber.from(0)); 

            await time.increase(oneYear);
            expect(await app.getEarnedReward(account1.address)).to.equal(ethers.BigNumber.from(0));
            expect(await app.getEarnedReward(account2.address)).to.equal(ethers.BigNumber.from(0)); 
        });

        it("Should allow withdrawing even if nothing is deposited", async function () {
            const { app, owner, account1, account2, usdc } = await loadFixture(deployFixture);

            const oneYear = 365 * 24 * 60 * 60;

            const ethBalance1Before = await ethers.provider.getBalance(account1.address);
            const ethBalance2Before = await ethers.provider.getBalance(account2.address);

            const devUsdcBalance1Before = await usdc.balanceOf(account1.address);
            const devUsdcBalance2Before = await usdc.balanceOf(account2.address);

            expect(await app.getEarnedReward(account1.address)).to.equal(ethers.BigNumber.from(0));
            expect(await app.getEarnedReward(account2.address)).to.equal(ethers.BigNumber.from(0));

            expect(await app.getStakedAmount(account1.address)).to.equal(ethers.BigNumber.from(0));
            expect(await app.getStakedAmount(account2.address)).to.equal(ethers.BigNumber.from(0)); 

            const tx1 = await (await app.connect(account1).withdraw()).wait();  
            const tx2 = await (await app.connect(account2).withdraw()).wait(); 

            const withdraw1GasFee = tx1.cumulativeGasUsed.mul(tx1.effectiveGasPrice);
            const withdraw2GasFee = tx2.cumulativeGasUsed.mul(tx2.effectiveGasPrice);

            expect(await app.getStakedAmount(account1.address)).to.equal(ethers.BigNumber.from(0));
            expect(await app.getStakedAmount(account2.address)).to.equal(ethers.BigNumber.from(0)); 

            expect(await usdc.balanceOf(account1.address)).to.equal(devUsdcBalance1Before);
            expect(await usdc.balanceOf(account2.address)).to.equal(devUsdcBalance2Before);

            expect(await ethers.provider.getBalance(account1.address)).to.equal(ethBalance1Before.sub(withdraw1GasFee));
            expect(await ethers.provider.getBalance(account2.address)).to.equal(ethBalance2Before.sub(withdraw2GasFee));   

            expect(await ethers.provider.getBalance((await app._cEth()))).to.equal(accruedInterest); 
            expect(await ethers.provider.getBalance(app.address)).to.equal(ethers.BigNumber.from(0)); 

            await time.increase(oneYear);
            expect(await app.getEarnedReward(account1.address)).to.equal(ethers.BigNumber.from(0));
            expect(await app.getEarnedReward(account2.address)).to.equal(ethers.BigNumber.from(0)); 
        });
    });

    describe("Reward calculation", function () {
        it("Should return correct devUSDC on getEarnedReward call", async function () {
            const { app, owner, account1, account2, usdc } = await loadFixture(deployFixture);

            const ethAmount1 = ethers.utils.parseEther("10");
            const ethAmount2 = ethers.utils.parseEther("15");

            await app.connect(account1).deposit({value: ethAmount1});
            await app.connect(account2).deposit({value: ethAmount2});

            const oneMonth = 30 * 24 * 60 * 60;
            await time.increase(oneMonth);

            const priceFeed = await hre.ethers.getContractAt("MockPriceFeed", await app._priceFeed());
            const decimals = await priceFeed.decimals();
            const ethPrice = await getEthPrice(priceFeed);

            const expectedEthReward1 = ethAmount1.mul(ethers.BigNumber.from(oneMonth+1))
                .div(ethers.BigNumber.from(365 * 24 * 60 * 60)).div(ethers.BigNumber.from(10));
            const expectedEthReward2 = ethAmount2.mul(ethers.BigNumber.from(oneMonth))
                .div(ethers.BigNumber.from(365 * 24 * 60 * 60)).div(ethers.BigNumber.from(10));

            const expectedReward1 = expectedEthReward1.mul(ethPrice).div(ethers.BigNumber.from(10).pow(decimals));
            const expectedReward2 = expectedEthReward2.mul(ethPrice).div(ethers.BigNumber.from(10).pow(decimals));

            expect(await app.getEarnedReward(account1.address)).to.equal(expectedReward1);
            expect(await app.getEarnedReward(account2.address)).to.equal(expectedReward2);
        });

        it("Should return correct devUSDC when withdrawing", async function () {
            const { app, owner, account1, account2, usdc } = await loadFixture(deployFixture);

            const ethAmount1 = ethers.utils.parseEther("10");
            const ethAmount2 = ethers.utils.parseEther("15");

            await app.connect(account1).deposit({value: ethAmount1});
            await app.connect(account2).deposit({value: ethAmount2});

            const oneMonth = 30 * 24 * 60 * 60;
            await time.increase(oneMonth);

            const priceFeed = await hre.ethers.getContractAt("MockPriceFeed", await app._priceFeed());
            const ethPrice = await getEthPrice(priceFeed);
            const decimals = await priceFeed.decimals();

            const expectedEthReward1 = ethAmount1.mul(ethers.BigNumber.from(oneMonth+2))
                .div(ethers.BigNumber.from(365 * 24 * 60 * 60)).div(ethers.BigNumber.from(10));
            const expectedEthReward2 = ethAmount2.mul(ethers.BigNumber.from(oneMonth+2))
                .div(ethers.BigNumber.from(365 * 24 * 60 * 60)).div(ethers.BigNumber.from(10));

            const expectedReward1 = expectedEthReward1.mul(ethPrice).div(ethers.BigNumber.from(10).pow(decimals));
            const expectedReward2 = expectedEthReward2.mul(ethPrice).div(ethers.BigNumber.from(10).pow(decimals));

            await expect(app.connect(account1).withdraw()).to.changeTokenBalance(usdc, account1.address, expectedReward1);
            await expect(app.connect(account2).withdraw()).to.changeTokenBalance(usdc, account2.address, expectedReward2);

            await time.increase(oneMonth);
            expect(await app.getEarnedReward(account1.address)).to.equal(ethers.BigNumber.from(0));
            expect(await app.getEarnedReward(account2.address)).to.equal(ethers.BigNumber.from(0)); 
        });
    });

    describe("Withdrawing Compound interest", function () {
        it("Should allow to withdraw Compound interest to the owner", async function () {
            const { app, owner, account1, account2 } = await loadFixture(deployFixture);

            const ethAmount1 = ethers.utils.parseEther("10");
            const ethAmount2 = ethers.utils.parseEther("15");
            const ethAmount3 = ethers.utils.parseEther("1");

            const cEth = await app._cEth();

            await app.connect(account1).deposit({value: ethAmount1});
            await app.connect(account2).deposit({value: ethAmount2});

            await expect(app.connect(owner).withdrawCompoundInterest(ethAmount3))
                .to.changeEtherBalances([cEth, owner.address], [ethAmount3.mul(-1), ethAmount3]);
                
            expect(await app._totalStakedAmount()).to.equal(ethAmount1.add(ethAmount2));  
            expect(await ethers.provider.getBalance((cEth))).to.equal(ethAmount1.add(ethAmount2));
        });

        it("Should revert when withdrawing Compound interest by non-owner accounts", async function () {
            const { app, owner, account1, account2 } = await loadFixture(deployFixture);

            const ethAmount1 = ethers.utils.parseEther("10");
            const ethAmount2 = ethers.utils.parseEther("15");
            const ethAmount3 = ethers.utils.parseEther("1");

            const cEth = await app._cEth();

            await app.connect(account1).deposit({value: ethAmount1});
            await app.connect(account2).deposit({value: ethAmount2});

            await expect(app.connect(account1).withdrawCompoundInterest(ethAmount3)).to.be.reverted;

            expect(await app._totalStakedAmount()).to.equal(ethAmount1.add(ethAmount2));  
            expect(await ethers.provider.getBalance((cEth))).to.equal(ethAmount1.add(ethAmount2).add(accruedInterest));
        });

        it("Should revert when withdrawing amount larger than Compound interest as Compound interest", async function () {
            const { app, owner, account1, account2 } = await loadFixture(deployFixture);

            const ethAmount1 = ethers.utils.parseEther("10");
            const ethAmount2 = ethers.utils.parseEther("15");
            const ethAmount3 = ethers.utils.parseEther("2");

            const cEth = await app._cEth();

            await app.connect(account1).deposit({value: ethAmount1});
            await app.connect(account2).deposit({value: ethAmount2});

            await expect(app.connect(owner).withdrawCompoundInterest(ethAmount3)).to.be.reverted;

            expect(await app._totalStakedAmount()).to.equal(ethAmount1.add(ethAmount2));  
            expect(await ethers.provider.getBalance((cEth))).to.equal(ethAmount1.add(ethAmount2).add(accruedInterest));
        });
    });

    describe("Simultaneous deposits and withdrawals", function () {
        it("Should track correct devUSDC rewards and staked ETH balances", async function () {
            const { app, owner, account1, account2, usdc } = await loadFixture(deployFixture);

            const ethAmount1 = ethers.utils.parseEther("10");
            const ethAmount2 = ethers.utils.parseEther("15");
            const ethAmount3 = ethers.utils.parseEther("20");
            const ethAmount4 = ethers.utils.parseEther("25");

            const priceFeed = await hre.ethers.getContractAt("MockPriceFeed", await app._priceFeed());
            const decimals = await priceFeed.decimals();

            //Moment 1: Account 1 deposits amount1 and account2 deposits amount2
            expect(await app.getStakedAmount(account1.address)).to.equal(ethers.BigNumber.from(0));
            expect(await app.getStakedAmount(account2.address)).to.equal(ethers.BigNumber.from(0)); 
            expect(await app._totalStakedAmount()).to.equal(ethers.BigNumber.from(0));  
            expect(await ethers.provider.getBalance((await app._cEth())))
                .to.equal(accruedInterest);

            await app.connect(account1).deposit({value: ethAmount1});
            await app.connect(account2).deposit({value: ethAmount2});

            expect(await app.getStakedAmount(account1.address)).to.equal(ethAmount1);
            expect(await app.getStakedAmount(account2.address)).to.equal(ethAmount2); 
            expect(await app._totalStakedAmount()).to.equal(ethAmount1.add(ethAmount2));  
            expect(await ethers.provider.getBalance((await app._cEth())))
                .to.equal(accruedInterest.add(ethAmount1).add(ethAmount2));            

            //Moment 2: Account 2 withdraws
            const oneMonth = 30 * 24 * 60 * 60;
            await time.increase(oneMonth);

            const ethPrice1 = await getEthPrice(priceFeed);

            const m2expectedEthReward1 = ethAmount1.mul(ethers.BigNumber.from(oneMonth+1))
                .div(ethers.BigNumber.from(365 * 24 * 60 * 60)).div(ethers.BigNumber.from(10));
            const m2expectedEthReward2 = ethAmount2.mul(ethers.BigNumber.from(oneMonth+1))
                .div(ethers.BigNumber.from(365 * 24 * 60 * 60)).div(ethers.BigNumber.from(10));

            const m2expectedReward1 = m2expectedEthReward1.mul(ethPrice1).div(ethers.BigNumber.from(10).pow(decimals));
            const m2expectedReward2 = m2expectedEthReward2.mul(ethPrice1).div(ethers.BigNumber.from(10).pow(decimals));

            expect(await app.getEarnedReward(account1.address)).to.equal(m2expectedReward1);
            await expect(app.connect(account2).withdraw()).to.changeTokenBalance(usdc, account2.address, m2expectedReward2);

            expect(await app.getStakedAmount(account1.address)).to.equal(ethAmount1);
            expect(await app.getStakedAmount(account2.address)).to.equal(ethers.BigNumber.from(0)); 
            expect(await app._totalStakedAmount()).to.equal(ethAmount1);  
            expect(await ethers.provider.getBalance((await app._cEth())))
                .to.equal(accruedInterest.add(ethAmount1));

            //Moment 3: Eth price changes, account 1 deposits amount 3, and account 2 deposits amount 4
            const oneDay = 24 * 60 * 60;
            await time.increase(oneDay);

            await priceFeed.connect(owner).setAnswer(ethers.utils.parseUnits("100", 8));
            const ethPrice2 = await getEthPrice(priceFeed);

            const m3expectedEthReward1 = ethAmount1.mul(ethers.BigNumber.from(oneMonth + oneDay + 3))
                .div(ethers.BigNumber.from(365 * 24 * 60 * 60)).div(ethers.BigNumber.from(10));
 
            const m3expectedReward1 = m3expectedEthReward1.mul(ethPrice2).div(ethers.BigNumber.from(10).pow(decimals));
            const m3expectedReward2 = ethers.BigNumber.from(0);

            expect(await app.getEarnedReward(account1.address)).to.equal(m3expectedReward1);
            expect(await app.getEarnedReward(account2.address)).to.equal(m3expectedReward2);

            await app.connect(account1).deposit({value: ethAmount3});
            await app.connect(account2).deposit({value: ethAmount4});

            expect(await app.getStakedAmount(account1.address)).to.equal(ethAmount1.add(ethAmount3));
            expect(await app.getStakedAmount(account2.address)).to.equal(ethAmount4); 
            expect(await app._totalStakedAmount()).to.equal(ethAmount1.add(ethAmount3).add(ethAmount4));  
            expect(await ethers.provider.getBalance((await app._cEth())))
                .to.equal(accruedInterest.add(ethAmount1).add(ethAmount3).add(ethAmount4));   

            //Moment 4: Account 2 and account 2 withdraw
            const oneYear = 365 * 24 * 60 * 60;
            await time.increase(oneYear);  
            
            const expectedEthRewardBeforeDeposit = ethAmount1.mul(ethers.BigNumber.from(oneMonth + oneDay + 4))
                .div(ethers.BigNumber.from(365 * 24 * 60 * 60)).div(ethers.BigNumber.from(10));
            const expectedEthRewardAfterDeposit = (ethAmount1.add(ethAmount3)).mul(ethers.BigNumber.from(oneYear+2))
                .div(ethers.BigNumber.from(365 * 24 * 60 * 60)).div(ethers.BigNumber.from(10));

            const m4expectedEthReward1 = expectedEthRewardBeforeDeposit.add(expectedEthRewardAfterDeposit);
            const m4expectedEthReward2 = ethAmount4.mul(ethers.BigNumber.from(oneYear+2))
                .div(ethers.BigNumber.from(365 * 24 * 60 * 60)).div(ethers.BigNumber.from(10));

            const m4expectedReward1 = m4expectedEthReward1.mul(ethPrice2).div(ethers.BigNumber.from(10).pow(decimals));
            const m4expectedReward2 = m4expectedEthReward2.mul(ethPrice2).div(ethers.BigNumber.from(10).pow(decimals));

            await expect(app.connect(account1).withdraw()).to.changeTokenBalance(usdc, account1.address, m4expectedReward1);
            await expect(app.connect(account2).withdraw()).to.changeTokenBalance(usdc, account2.address, m4expectedReward2);
            
        });
    });
});
