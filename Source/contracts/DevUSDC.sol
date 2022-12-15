// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import '@openzeppelin/contracts/access/AccessControl.sol';
import '@openzeppelin/contracts/token/ERC20/ERC20.sol';

contract DevUSDC is AccessControl, ERC20 {

    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    constructor() 
        ERC20("DevUSDC", "DevUSDC")
    {
        _setupRole(DEFAULT_ADMIN_ROLE, _msgSender());
    }

    function mint(address to, uint256 amount) 
        public
    {
        require(hasRole(MINTER_ROLE, _msgSender()), "DevUSDC: must have minter role to mint");
        _mint(to, amount);
    }
}