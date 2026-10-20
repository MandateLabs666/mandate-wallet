// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
import {MandateAccount, IAuthorizationAsset} from "./MandateAccount.sol";

/// @notice No upgrade or admin authority. A creator can only create an account owned by itself.
contract MandateFactory {
    event AccountCreated(address indexed owner, address indexed asset, address account, bytes32 userSalt);

    function predictAccount(address owner, IAuthorizationAsset asset, bytes32 userSalt) public view returns (address) {
        bytes32 salt = keccak256(abi.encode(owner, address(asset), userSalt));
        bytes32 codeHash = keccak256(abi.encodePacked(type(MandateAccount).creationCode, abi.encode(owner, asset)));
        return address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), address(this), salt, codeHash)))));
    }

    function createAccount(IAuthorizationAsset asset, bytes32 userSalt) external returns (address account) {
        account = predictAccount(msg.sender, asset, userSalt);
        if (account.code.length != 0) return account;
        bytes32 salt = keccak256(abi.encode(msg.sender, address(asset), userSalt));
        account = address(new MandateAccount{salt: salt}(msg.sender, asset));
        emit AccountCreated(msg.sender, address(asset), account, userSalt);
    }
}
