// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
import {EchoAuthContext, EchoSwap} from "./EchoTypes.sol";

/// @notice One canonical deadline-bearing ISwapRouter ABI shared by validation and execution.
contract EchoIntentDecoder {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    struct ExactOutputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 deadline;
        uint256 amountOut;
        uint256 amountInMaximum;
        uint160 sqrtPriceLimitX96;
    }
    bytes4 public constant EXACT_INPUT_SINGLE =
        bytes4(keccak256("exactInputSingle((address,address,uint24,address,uint256,uint256,uint256,uint160))"));
    bytes4 public constant EXACT_OUTPUT_SINGLE =
        bytes4(keccak256("exactOutputSingle((address,address,uint24,address,uint256,uint256,uint256,uint160))"));
    bytes4 public constant EXECUTE =
        bytes4(keccak256("execute(bytes32,bytes,(bytes32,uint64,bytes32,uint64,uint48,uint48,uint256))"));
    error InvalidEncoding();

    function decode(bytes calldata inner) public pure returns (EchoSwap memory s) {
        if (inner.length != 260) revert InvalidEncoding();
        bytes4 selector = bytes4(inner[:4]);
        if (selector == EXACT_INPUT_SINGLE) {
            ExactInputSingleParams memory p = abi.decode(inner[4:], (ExactInputSingleParams));
            if (keccak256(inner) != keccak256(abi.encodeWithSelector(selector, p))) revert InvalidEncoding();
            s = EchoSwap(p.tokenIn, p.tokenOut, p.recipient, p.deadline, p.amountIn, p.amountOutMinimum, false);
        } else if (selector == EXACT_OUTPUT_SINGLE) {
            ExactOutputSingleParams memory p = abi.decode(inner[4:], (ExactOutputSingleParams));
            if (keccak256(inner) != keccak256(abi.encodeWithSelector(selector, p))) revert InvalidEncoding();
            s = EchoSwap(p.tokenIn, p.tokenOut, p.recipient, p.deadline, p.amountInMaximum, p.amountOut, true);
        } else {
            revert InvalidEncoding();
        }
        if (
            s.tokenIn == address(0) || s.tokenOut == address(0) || s.tokenIn == s.tokenOut || s.maxAmountIn == 0
                || s.outputConstraint == 0
        ) revert InvalidEncoding();
    }

    function decodeOuter(bytes calldata callData)
        external
        view
        returns (address target, bytes memory inner, EchoAuthContext memory auth, EchoSwap memory swap)
    {
        if (callData.length < 4 || bytes4(callData[:4]) != EXECUTE) revert InvalidEncoding();
        (bytes32 mode, bytes memory packed, EchoAuthContext memory a) =
            abi.decode(callData[4:], (bytes32, bytes, EchoAuthContext));
        if (
            mode != bytes32(0) || packed.length != 312
                || keccak256(callData) != keccak256(abi.encodeWithSelector(EXECUTE, mode, packed, a))
        ) revert InvalidEncoding();
        target = address(bytes20(packed));
        uint256 value;
        assembly ("memory-safe") { value := mload(add(packed, 52)) }
        if (target == address(0) || value != 0) revert InvalidEncoding();
        inner = new bytes(260);
        for (uint256 i; i < 260; i++) {
            inner[i] = packed[i + 52];
        }
        // Reuse the exact same inner decoder; the external call is stateless.
        return (target, inner, a, this.decode(inner));
    }
}
