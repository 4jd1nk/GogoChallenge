// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

interface CEth {
    function mint() external payable;

    function redeemUnderlying(uint) external returns (uint);

    function balanceOfUnderlying(address owner) external returns (uint);
}