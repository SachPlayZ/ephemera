// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "forge-std/Script.sol";
import "../src/Verifier.sol";
import "../src/IssuerRegistry.sol";
import "../src/EPoHBadge.sol";

contract Deploy is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        vm.startBroadcast(deployerKey);

        // 1. Deploy verifier
        HonkVerifier verifier = new HonkVerifier();
        console.log("HonkVerifier deployed at:", address(verifier));

        // 2. Deploy issuer registry (deployer is owner)
        IssuerRegistry registry = new IssuerRegistry(deployer);
        console.log("IssuerRegistry deployed at:", address(registry));

        // 3. Deploy badge contract
        EPoHBadge badge = new EPoHBadge(address(verifier), address(registry), deployer);
        console.log("EPoHBadge deployed at:", address(badge));

        // 4. Optionally register an initial issuer pubkey hash
        bytes32 issuerHash = vm.envOr("INITIAL_ISSUER_HASH", bytes32(0));
        if (issuerHash != bytes32(0)) {
            registry.addIssuer(issuerHash);
            console.log("Registered initial issuer");
        }

        vm.stopBroadcast();
    }
}
