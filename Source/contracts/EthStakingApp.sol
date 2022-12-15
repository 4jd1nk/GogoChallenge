// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import './DevUSDC.sol';
import './CEth.sol';
import '@openzeppelin/contracts/access/Ownable.sol';
import '@openzeppelin/contracts/security/ReentrancyGuard.sol';
import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

/** 
 * @title ETH Staking App
 * @author Ajdin Kahrovic
 * @notice This smart contract is the implementation of the challenge set by GOGO Protocol
 * @dev Smart contract inherits Ownable to allow owner of the app to withdraw accrued interest on Compound
 * and ReentrancyGuard to prevent reentrancy attack through deposit and withdraw functions
 */
contract EthStakingApp is Ownable, ReentrancyGuard {
    //solhint-disable not-rely-on-time

    struct Staker {
        uint stakedAmount;
        uint ethRewardAmount;
        uint lastRewardCalcTimestamp;
    }

    mapping(address => Staker) public _stakers;
    uint public _totalStakedAmount;

    DevUSDC public _rewardToken;
    AggregatorV3Interface public _priceFeed;
    CEth public _cEth;

    event Deposit(address account, uint amount);
    event Withdrawal(address account, uint amount);

    /**
     * @dev Addresses of devUSDC, price feed and cETH smart contracts are injected on the deployment of the smart
     * contract, as opposed to the alternative implementation in which their addresses could be written in constant
     * variables directly in the code. This approach allows using the same smart contract on mainnet, all testnets and
     * all EVM-based blockchains which are supported by Chainlink and Compound. Changes are not required to adapt it to
     * different networks. Additionally, this approach allows injecting mock price feed and cETH for local testing.
     * 
     * Alternatively, devUSDC could be deployed in the constructor. In that case, it could inherit simpler and more
     * gas efficient contract of Ownable instead of AccessControl. EthStakingApp would be the owner and only allowed to
     * mint new tokens. However, in mainnet usage of EthStakingApp, it would be probably expected that reward received
     * is denominated in the token that already exists and has additional utilities outside EthStakingApp. 
     */
    constructor(address rewardToken, address priceFeed, address cEth) 
    {
        _rewardToken = DevUSDC(rewardToken);
        _priceFeed = AggregatorV3Interface(priceFeed);
        _cEth = CEth(cEth);
    }

    function getStakedAmount(address account)
        external
        view
        returns(uint)
    {
        return _stakers[account].stakedAmount;
    }

    function getEarnedReward(address account)
        external
        view
        returns(uint)
    {
        uint ethReward = _getReward(account);
        return _getUSDCAmount(ethReward);
    }

    /**
     * @dev Function assumes that minimum amount to stake per deposit is 5 ETH.
     * Alternative understanding would be that total deposited amount should never be less than 5 ETH. In this case,
     * function would not require that msg.value amount is greater than or equal to 5 ETH, but rather
     * _stakers[msg.sender].stakedAmount after addition of msg.value.
     * Current implementation seemed more reasonable.
     */
    function deposit() 
        payable 
        external 
        nonReentrant
    {
        require(msg.value >= 5 ether, "EthStakingApp: Minimal staking amount is 5 ETH");
        
        _calculateReward(msg.sender);

        _cEth.mint{ value: msg.value }();

        _stakers[msg.sender].stakedAmount+=msg.value;
        _totalStakedAmount+=msg.value;

        emit Deposit(msg.sender, msg.value);
    }

    /**
     * @dev As it was not stated by the requirements, author assumed that only the total staked amount can be withdrawn.
     * Therefore, no partial withdrawals are permitted. Alternative implementation would be that amount intended to be
     * withdrawn is passed as an argument of the function. In that case, stakedAmount would not be set to 0, but rather,
     * the passed amount would be subtracted from the stakedAmount. Issue with this approach would be that additional 
     * ambiguity would be introduced - whether to mint the reward proportional to the amount withdrawn or to mint total
     * reward. Therefore, simpler and cleaner approach to this implementation was taken.
     * 
     * Requirements of the challenge did not state if EthStakerApp can mint devUSDC tokens. For the purpose of this task,
     * it was assumed that new devUSDC tokens are minted to stakers. DevUSDC implementation is adjusted to this case, so
     * it supports minting and minter role is granted to EthStakerApp. Alternative (and more realistic, especially if
     * the owner of EthStakingApp is not the issuer of devUSDC) approach would be that the owner / administrator of
     * EthStakingApp transferred substantial amount of devUSDC to this smart contract and then, withdrawals would
     * transfer existing devUSDC tokens, instead of minting new tokens. In that case, smart contract would need to check
     * if there is a sufficient balance of devUSDC before allowing withdrawal. This approach would impose risk to
     * stakers, as a malicious owner could prevent withdrawals, just by not obtaining sufficient amount of devUSDC tokens.
     * 
     * This function can be improved by wrapping interaction with cETH smart contract into try-catch block. In case that
     * redeeming fails, certain emergency exit should be allowed to users. 
     */
    function withdraw() 
        external 
        nonReentrant
    {
        _calculateReward(msg.sender);

        uint ethAmountToReturn = _stakers[msg.sender].stakedAmount;
        uint rewardAmount = _getUSDCAmount(_stakers[msg.sender].ethRewardAmount);

        _stakers[msg.sender].stakedAmount = 0;
        _stakers[msg.sender].ethRewardAmount = 0;

        if (ethAmountToReturn > 0) 
        {
            _totalStakedAmount -= ethAmountToReturn;
            require(_cEth.redeemUnderlying(ethAmountToReturn) == 0, "EthStakingApp: Redeeming from Compound failed");
            payable(msg.sender).transfer(ethAmountToReturn);
        }

        if (rewardAmount > 0) 
        {
            _rewardToken.mint(msg.sender, rewardAmount);
        }

        emit Withdrawal(msg.sender, ethAmountToReturn);
    }

    /**
     * @dev This function was not requested by the requirements of the challenge, but it was needed to allow
     * withdrawal of accrued interest from Compound. As EthStakingApp becomes the holder of cETH tokens, remaining
     * cETH tokens representing accrued interest can be withdrawn only by the smart contract. Therefore, this is 
     * permissioned function that enables this action.
     * 
     * Function redeems underlying ETH, calculated as a difference between the ETH balance of this smart contract,
     * tracked by cETH smart contract, and the total staked amount, tracked by ETHStakingApp smart contract. ETH that
     * is redeemed is transferred to the owner.
     * 
     * Alternative implmentation would assume that cETH tokens are redeemed, instead of ETH.
     */
    function withdrawCompoundInterest(uint amount) 
        external 
        onlyOwner 
    {
        uint compoundBalance = _cEth.balanceOfUnderlying(address(this));
        require(amount <= compoundBalance - _totalStakedAmount, "EthStakingApp: No touching of customer's funds");
        require(_cEth.redeemUnderlying(amount) == 0, "EthStakingApp: Redeeming from Compound failed");
        payable(owner()).transfer(amount);
    }

    function _calculateReward(address account) 
        private 
    {
        _stakers[account].ethRewardAmount = _getReward(account); 
        _stakers[msg.sender].lastRewardCalcTimestamp = block.timestamp;
    }

    /**
     * @dev Possible improvement to this function would be to wrap calculations in unchecked section, as most probably
     * calculations cannot produce overflow. That would save the gas to a certain extent. Further examination can be made, 
     * but taking into account the total supply of Ether, and length of human history, none of variables can produce 
     * overflow.
     */
    function _getReward(address account) 
        private
        view
        returns (uint)
    {
        if (_stakers[account].lastRewardCalcTimestamp == 0)
            return 0;

        uint timePassed = block.timestamp - _stakers[account].lastRewardCalcTimestamp;
        return _stakers[account].ethRewardAmount + (((_stakers[account].stakedAmount * timePassed) / 365 days) / 10); 
    }

    /**
     * @dev Possible improvement to this function would be to wrap calculations in unchecked section, as most probably
     * calculations cannot produce overflow. That would save the gas to a certain extent. Further examination can be made, 
     * but taking into account the reasonable price of Ether and its total supply, none of variables can produce overflow.
     * 
     * Improvement can be made to ensure fallback flow in case that Chainlink's price feed becomes unavailable. Possible
     * options include caching locally last Ether price and wrapping _priceFeed.latestRoundData() in try-catch block,
     * together with attempts to access round data from previous oracle updates. 
     * 
     * As challenge requirements didn't specify when devUSDC - Ether price rate will be retrieved, it was assumed that
     * it is checked on the withdrawal. Alternative and more complex solution would be to check the rate from all
     * rounds from start of deposit to the withdrawal and to determine devUSDC amount that should be minted based on 
     * the dynamic Ether price.
     */
    function _getUSDCAmount(uint ethAmount)
        private
        view
        returns (uint)
    {
        uint scallingFactor = 10 ** _priceFeed.decimals();
        (,int ethPrice,,,) = _priceFeed.latestRoundData();
        return (ethAmount * uint(ethPrice)) / scallingFactor;            
    } 

    receive() external payable { }
}