pragma solidity >= 0.5.0 <6.0.0;

contract GeoDBClasses {

  // Struct containing a federation member stake and its withdrawal attempts.
  struct FederationStake {
    uint256 stake; // Member token staking
    bool approved; // Member's voted admission by the rest of the federation
  }

  struct Ballot {
    uint256 approvals;
    uint256 deadline;
    mapping(address => bool) approvers;
    bool resolved;
  }

  struct BlockSummary {
    address minter;
    address nextMinter;
    address[] rewardedAddresses;
    mapping(address => uint256) rewardedAmounts;
  }


}
