// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./IssuerRegistry.sol";
import {IVerifier} from "./Verifier.sol";

contract EPoHBadge is ERC721, Ownable {
    struct Badge {
        uint8 claimType;
        uint64 expiresAt;
        bytes32 subjectHash;
        bytes32 issuerPubkeyHash;
    }

    IVerifier public immutable verifier;
    IssuerRegistry public immutable issuerRegistry;

    uint256 private _nextTokenId;
    mapping(uint256 => Badge) private _badges;

    event BadgeMinted(
        uint256 indexed tokenId,
        address indexed to,
        uint8 claimType,
        uint64 expiresAt,
        bytes32 subjectHash,
        bytes32 issuerPubkeyHash
    );

    error InvalidProof();
    error UnknownIssuer(bytes32 pubkeyHash);
    error BadgeExpired(uint64 expiresAt);
    error SoulboundTransfer();

    constructor(
        address verifier_,
        address issuerRegistry_,
        address owner_
    ) ERC721("Ephemeral Proof of Health", "EPoH") Ownable(owner_) {
        verifier = IVerifier(verifier_);
        issuerRegistry = IssuerRegistry(issuerRegistry_);
    }

    /// @notice Mint a soulbound health badge by providing a valid ZK proof.
    /// @param proof The UltraHonk proof bytes.
    /// @param publicInputs [claimType, expiresAt, subjectHash, issuerPubkeyHash]
    function mintBadge(bytes calldata proof, bytes32[] calldata publicInputs) external returns (uint256) {
        require(publicInputs.length == 4, "bad public inputs length");

        // Verify ZK proof
        bool valid = verifier.verify(proof, publicInputs);
        if (!valid) revert InvalidProof();

        // Decode public inputs
        uint8 claimType = uint8(uint256(publicInputs[0]));
        uint64 expiresAt = uint64(uint256(publicInputs[1]));
        bytes32 subjectHash = publicInputs[2];
        bytes32 issuerPubkeyHash = publicInputs[3];

        // Check issuer is whitelisted
        if (!issuerRegistry.isIssuer(issuerPubkeyHash)) {
            revert UnknownIssuer(issuerPubkeyHash);
        }

        // Check badge hasn't expired
        if (expiresAt <= block.timestamp) {
            revert BadgeExpired(expiresAt);
        }

        // Mint soulbound token
        uint256 tokenId = _nextTokenId++;
        _safeMint(msg.sender, tokenId);
        _badges[tokenId] = Badge(claimType, expiresAt, subjectHash, issuerPubkeyHash);

        emit BadgeMinted(tokenId, msg.sender, claimType, expiresAt, subjectHash, issuerPubkeyHash);
        return tokenId;
    }

    /// @notice Check if a badge is still valid (not expired).
    function isValid(uint256 tokenId) external view returns (bool) {
        require(_ownerOf(tokenId) != address(0), "nonexistent token");
        return _badges[tokenId].expiresAt > block.timestamp;
    }

    /// @notice Get badge data.
    function getBadge(uint256 tokenId) external view returns (Badge memory) {
        require(_ownerOf(tokenId) != address(0), "nonexistent token");
        return _badges[tokenId];
    }

    /// @notice Allow badge holder to burn their own badge.
    function burn(uint256 tokenId) external {
        require(ownerOf(tokenId) == msg.sender, "not badge owner");
        _burn(tokenId);
    }

    /// @dev Override to make tokens soulbound (non-transferable).
    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address from = _ownerOf(tokenId);
        // Allow minting (from == 0) and burning (to == 0), block transfers
        if (from != address(0) && to != address(0)) {
            revert SoulboundTransfer();
        }
        return super._update(to, tokenId, auth);
    }
}
