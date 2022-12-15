// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

contract MockPriceFeed is AggregatorV3Interface {
    // solhint-disable


    int public _answer;

    constructor(int answer) 
    {
        _answer = answer;
    }

    function setAnswer(int answer) external
    {
        _answer = answer;
    }

    function decimals() external view returns (uint8) 
    {
        return 8;
    }

    function description() external view returns (string memory)
    {
        return "description";
    }

    function version() external view returns (uint256) {
        return 0;
    }

    function getRoundData(uint80 _roundId)
    external
    view
    returns (
        uint80 roundId,
        int256 answer,
        uint256 startedAt,
        uint256 updatedAt,
        uint80 answeredInRound
    ) 
    {
        answer = _answer;
    }

    function latestRoundData()
    external
    view
    returns (
        uint80 roundId,
        int256 answer,
        uint256 startedAt,
        uint256 updatedAt,
        uint80 answeredInRound
    ) 
    {
        answer = _answer;
    }
}