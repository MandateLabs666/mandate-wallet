// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EchoAuthContext} from "./EchoTypes.sol";

/// @notice Stateless signature verification. Permissions live in sender-associated storage.
contract EchoPolicyValidator {
    bytes32 private constant DOMAIN_TYPE =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant AUTH_TYPE = keccak256(
        "EchoUserOperation(bytes32 userOpHash,address entryPoint,address implementation,bytes32 instanceId,uint64 policyVersion,bytes32 sessionId,uint64 authorityEpoch,uint48 validAfter,uint48 validUntil,uint256 operationNonce)"
    );

    function digest(
        address account,
        address entryPoint,
        address implementation,
        bytes32 userOpHash,
        EchoAuthContext calldata a
    ) public view returns (bytes32) {
        bytes32 domain = keccak256(
            abi.encode(DOMAIN_TYPE, keccak256("EchoAuthority"), keccak256("2"), block.chainid, account)
        );
        bytes32 message = keccak256(
            abi.encode(
                AUTH_TYPE,
                userOpHash,
                entryPoint,
                implementation,
                a.instanceId,
                a.policyVersion,
                a.sessionId,
                a.authorityEpoch,
                a.validAfter,
                a.validUntil,
                a.nonce
            )
        );
        return keccak256(abi.encodePacked("\x19\x01", domain, message));
    }

    function verify(
        address account,
        address entryPoint,
        address implementation,
        bytes32 userOpHash,
        EchoAuthContext calldata a,
        address signer,
        bytes calldata sig
    ) external view returns (bool) {
        if (sig.length != 66 || uint8(sig[0]) != 2) return false;
        (address recovered, ECDSA.RecoverError err,) =
            ECDSA.tryRecover(digest(account, entryPoint, implementation, userOpHash, a), sig[1:]);
        return err == ECDSA.RecoverError.NoError && recovered == signer && signer != address(0);
    }
}
