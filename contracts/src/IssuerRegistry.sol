// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/access/Ownable.sol";

contract IssuerRegistry is Ownable {
    mapping(bytes32 => bool) private _issuers;

    event IssuerAdded(bytes32 indexed pubkeyHash);
    event IssuerRemoved(bytes32 indexed pubkeyHash);

    constructor(address owner_) Ownable(owner_) {}

    function addIssuer(bytes32 pubkeyHash) external onlyOwner {
        require(!_issuers[pubkeyHash], "already registered");
        _issuers[pubkeyHash] = true;
        emit IssuerAdded(pubkeyHash);
    }

    function removeIssuer(bytes32 pubkeyHash) external onlyOwner {
        require(_issuers[pubkeyHash], "not registered");
        _issuers[pubkeyHash] = false;
        emit IssuerRemoved(pubkeyHash);
    }

    function isIssuer(bytes32 pubkeyHash) external view returns (bool) {
        return _issuers[pubkeyHash];
    }
}
