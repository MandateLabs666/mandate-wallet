// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {IERC1271} from "@openzeppelin/contracts/interfaces/IERC1271.sol";

/// @notice Local testing only; minting and cancellation are intentionally unrestricted.
contract MockUSDC is ERC20 {
    bytes32 public immutable DOMAIN_SEPARATOR;
    bytes32 private constant AUTH_TYPE = keccak256("TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)");
    mapping(address => mapping(bytes32 => bool)) public authorizationState;
    event AuthorizationUsed(address indexed authorizer, bytes32 indexed nonce);
    event AuthorizationCanceled(address indexed authorizer, bytes32 indexed nonce);

    constructor() ERC20("USDC", "USDC") {
        DOMAIN_SEPARATOR = keccak256(abi.encode(keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"), keccak256("USDC"), keccak256("2"), block.chainid, address(this)));
    }
    function decimals() public pure override returns (uint8) { return 6; }
    function mint(address to, uint256 amount) external { _mint(to, amount); }
    function cancelForTest(address from, bytes32 nonce) external {
        require(!authorizationState[from][nonce], "used");
        authorizationState[from][nonce] = true;
        emit AuthorizationCanceled(from, nonce);
    }
    function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, bytes calldata signature) external {
        _authorizedTransfer(from, to, value, validAfter, validBefore, nonce, signature);
    }
    function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s) external {
        _authorizedTransfer(from, to, value, validAfter, validBefore, nonce, abi.encodePacked(r, s, v));
    }
    function _authorizedTransfer(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, bytes memory signature) private {
        require(block.timestamp > validAfter && block.timestamp < validBefore, "time");
        require(!authorizationState[from][nonce], "used");
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, keccak256(abi.encode(AUTH_TYPE, from, to, value, validAfter, validBefore, nonce))));
        bool valid = from.code.length == 0 ? ECDSA.recover(digest, signature) == from : IERC1271(from).isValidSignature(digest, signature) == 0x1626ba7e;
        require(valid, "signature");
        authorizationState[from][nonce] = true;
        emit AuthorizationUsed(from, nonce);
        _transfer(from, to, value);
    }
}
