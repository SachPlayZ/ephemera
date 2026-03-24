// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "forge-std/Script.sol";
import "../src/EPoHBadge.sol";

contract MintBadge is Script {
    function run() external {
        address badgeAddr = vm.envAddress("BADGE_ADDRESS");
        uint256 minterKey = vm.envUint("MINTER_PRIVATE_KEY");

        // Load proof from file
        string memory proofHex = vm.readFile("test/fixtures/proof.hex");
        bytes memory proof = vm.parseBytes(proofHex);

        bytes32[] memory publicInputs = new bytes32[](4);
        publicInputs[0] = bytes32(uint256(0)); // claim_type = VACCINATED
        publicInputs[1] = bytes32(uint256(0x65554280)); // expires_at = 1700086400
        publicInputs[2] = 0x066941c7b276ab78294d1e1511090b6df9232b21561f5d203bd047a7d0732108;
        publicInputs[3] = 0x16b085b3d759d330bcf290a3fdbf56595330d4acbd57e8ae9360f09e22206112;

        vm.startBroadcast(minterKey);
        EPoHBadge badge = EPoHBadge(badgeAddr);
        uint256 tokenId = badge.mintBadge(proof, publicInputs);
        console.log("Minted badge tokenId:", tokenId);
        vm.stopBroadcast();

        // Verify it's valid
        bool valid = badge.isValid(tokenId);
        console.log("Badge is valid:", valid);

        EPoHBadge.Badge memory b = badge.getBadge(tokenId);
        console.log("Claim type:", b.claimType);
        console.log("Expires at:", b.expiresAt);
    }
}
