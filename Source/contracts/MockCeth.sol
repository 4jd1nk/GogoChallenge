// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import './CEth.sol';

contract MockCEth is CEth {
    // solhint-disable

    constructor() payable 
    {

    }

    function mint() external payable 
    {

    }

    function redeemUnderlying(uint amount) external returns (uint) 
    {
        payable(msg.sender).transfer(amount);
        return 0;
    }

    function balanceOfUnderlying(address owner) external returns (uint) 
    {
        return address(this).balance;
    }
}