// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "forge-std/Test.sol";
import "../src/EPoHBadge.sol";
import "../src/IssuerRegistry.sol";

/// @dev Mock verifier that always returns true
contract MockVerifier is IVerifier {
    bool public returnValue = true;
    function setReturnValue(bool v) external { returnValue = v; }
    function verify(bytes calldata, bytes32[] calldata) external view returns (bool) {
        return returnValue;
    }
}

contract IssuerRegistryTest is Test {
    IssuerRegistry registry;
    address owner = address(this);
    bytes32 issuerHash = bytes32(uint256(0xdeadbeef));

    function setUp() public {
        registry = new IssuerRegistry(owner);
    }

    function test_addIssuer() public {
        registry.addIssuer(issuerHash);
        assertTrue(registry.isIssuer(issuerHash));
    }

    function test_removeIssuer() public {
        registry.addIssuer(issuerHash);
        registry.removeIssuer(issuerHash);
        assertFalse(registry.isIssuer(issuerHash));
    }

    function test_addIssuer_emitsEvent() public {
        vm.expectEmit(true, false, false, false);
        emit IssuerRegistry.IssuerAdded(issuerHash);
        registry.addIssuer(issuerHash);
    }

    function test_addIssuer_revertIfAlreadyRegistered() public {
        registry.addIssuer(issuerHash);
        vm.expectRevert("already registered");
        registry.addIssuer(issuerHash);
    }

    function test_removeIssuer_revertIfNotRegistered() public {
        vm.expectRevert("not registered");
        registry.removeIssuer(issuerHash);
    }

    function test_onlyOwnerCanAdd() public {
        vm.prank(address(0xBEEF));
        vm.expectRevert();
        registry.addIssuer(issuerHash);
    }

    function test_onlyOwnerCanRemove() public {
        registry.addIssuer(issuerHash);
        vm.prank(address(0xBEEF));
        vm.expectRevert();
        registry.removeIssuer(issuerHash);
    }
}

contract EPoHBadgeTest is Test {
    EPoHBadge badge;
    MockVerifier mockVerifier;
    IssuerRegistry registry;
    address owner = address(this);
    address minter = address(0x1234);

    // Public inputs from the real circuit proof
    bytes32 constant CLAIM_TYPE = bytes32(uint256(0)); // VACCINATED
    bytes32 constant EXPIRES_AT = bytes32(uint256(0x65554280)); // 1700086400
    bytes32 constant SUBJECT_HASH = 0x066941c7b276ab78294d1e1511090b6df9232b21561f5d203bd047a7d0732108;
    bytes32 constant ISSUER_PUBKEY_HASH = 0x16b085b3d759d330bcf290a3fdbf56595330d4acbd57e8ae9360f09e22206112;

    function setUp() public {
        mockVerifier = new MockVerifier();
        registry = new IssuerRegistry(owner);
        badge = new EPoHBadge(address(mockVerifier), address(registry), owner);

        // Register the test issuer
        registry.addIssuer(ISSUER_PUBKEY_HASH);

        // Warp to before expiry
        vm.warp(1700000000);
    }

    function _publicInputs() internal pure returns (bytes32[] memory) {
        bytes32[] memory inputs = new bytes32[](4);
        inputs[0] = CLAIM_TYPE;
        inputs[1] = EXPIRES_AT;
        inputs[2] = SUBJECT_HASH;
        inputs[3] = ISSUER_PUBKEY_HASH;
        return inputs;
    }

    function test_mintBadge() public {
        vm.prank(minter);
        uint256 tokenId = badge.mintBadge(hex"", _publicInputs());
        assertEq(tokenId, 0);
        assertEq(badge.ownerOf(0), minter);

        EPoHBadge.Badge memory b = badge.getBadge(0);
        assertEq(b.claimType, 0);
        assertEq(b.expiresAt, 1700086400);
        assertEq(b.subjectHash, SUBJECT_HASH);
        assertEq(b.issuerPubkeyHash, ISSUER_PUBKEY_HASH);
    }

    function test_mintBadge_emitsEvent() public {
        vm.prank(minter);
        vm.expectEmit(true, true, false, true);
        emit EPoHBadge.BadgeMinted(0, minter, 0, 1700086400, SUBJECT_HASH, ISSUER_PUBKEY_HASH);
        badge.mintBadge(hex"", _publicInputs());
    }

    function test_isValid_beforeExpiry() public {
        vm.prank(minter);
        badge.mintBadge(hex"", _publicInputs());
        assertTrue(badge.isValid(0));
    }

    function test_isValid_afterExpiry() public {
        vm.prank(minter);
        badge.mintBadge(hex"", _publicInputs());

        // Warp past expiry
        vm.warp(1700086401);
        assertFalse(badge.isValid(0));
    }

    function test_revert_invalidProof() public {
        mockVerifier.setReturnValue(false);
        vm.prank(minter);
        vm.expectRevert(EPoHBadge.InvalidProof.selector);
        badge.mintBadge(hex"", _publicInputs());
    }

    function test_revert_unknownIssuer() public {
        // Remove the issuer
        registry.removeIssuer(ISSUER_PUBKEY_HASH);

        vm.prank(minter);
        vm.expectRevert(abi.encodeWithSelector(EPoHBadge.UnknownIssuer.selector, ISSUER_PUBKEY_HASH));
        badge.mintBadge(hex"", _publicInputs());
    }

    function test_revert_expiredBadge() public {
        // Warp past expiry
        vm.warp(1700086401);

        vm.prank(minter);
        vm.expectRevert(abi.encodeWithSelector(EPoHBadge.BadgeExpired.selector, uint64(0x65554280)));
        badge.mintBadge(hex"", _publicInputs());
    }

    function test_soulbound_blockTransfer() public {
        vm.prank(minter);
        badge.mintBadge(hex"", _publicInputs());

        vm.prank(minter);
        vm.expectRevert(EPoHBadge.SoulboundTransfer.selector);
        badge.transferFrom(minter, address(0xBEEF), 0);
    }

    function test_burn() public {
        vm.prank(minter);
        badge.mintBadge(hex"", _publicInputs());

        vm.prank(minter);
        badge.burn(0);
        vm.expectRevert();
        badge.ownerOf(0);
    }

    function test_burn_revertIfNotOwner() public {
        vm.prank(minter);
        badge.mintBadge(hex"", _publicInputs());

        vm.prank(address(0xBEEF));
        vm.expectRevert("not badge owner");
        badge.burn(0);
    }

    function test_multipleMints() public {
        vm.prank(minter);
        uint256 id0 = badge.mintBadge(hex"", _publicInputs());
        vm.prank(minter);
        uint256 id1 = badge.mintBadge(hex"", _publicInputs());
        assertEq(id0, 0);
        assertEq(id1, 1);
    }
}
