// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {FunctionsClient} from "@chainlink/contracts@1.4.0/src/v0.8/functions/v1_0_0/FunctionsClient.sol";
import {ConfirmedOwner} from "@chainlink/contracts@1.4.0/src/v0.8/shared/access/ConfirmedOwner.sol";
import {FunctionsRequest} from "@chainlink/contracts@1.4.0/src/v0.8/functions/v1_0_0/libraries/FunctionsRequest.sol";

contract Verification is FunctionsClient, ConfirmedOwner {
    using FunctionsRequest for FunctionsRequest.Request;

    bytes32 public s_lastRequestId;
    bytes public s_lastResponse;
    bytes public s_lastError;

    // ADDED: Only allow specific subscription IDs
    mapping(uint64 => bool) public allowedSubscriptions;

    error UnexpectedRequestID(bytes32 requestId);

    event Response(
        bytes32 indexed requestId,
        uint256 Owner_ID,
        bytes response,
        bytes err
    );

    address router = 0xb83E47C2bC239B3bf370bc41e1459A34b41238D0;

    string source =
        "let property_id = args[0];"
        "if (!property_id) throw new Error(\"Missing property_id\");"
        "const apiResponse = await Functions.makeHttpRequest({"
        "    url: `https://property-api-9b2o.onrender.com/api/${property_id}`,"
        "});"
        "if (apiResponse.error) throw new Error(\"Request failed\");"
        "let ID = apiResponse.data?.Owner_ID;"
        "if (!ID) throw new Error(\"Missing Owner_ID in API response\");"
        "let ownerInt = parseInt(ID);"
        "if (isNaN(ownerInt)) throw new Error(\"Owner_ID is not a valid number\");"
        "return Functions.encodeInt256(ownerInt);";

    uint32 gasLimit = 300000;
    bytes32 donID = 0x66756e2d657468657265756d2d7365706f6c69612d3100000000000000000000;
    uint256 public Owner_ID;

    constructor() FunctionsClient(router) ConfirmedOwner(msg.sender) {
        // ADDED: Pre-authorize the subscription ID used by RealEstate contract
        allowedSubscriptions[4949] = true; // VERIFICATION_SUB_ID from RealEstate
    }

    // REMOVED onlyOwner, ADDED subscription validation
    function sendRequest(
        uint64 subscriptionId,
        string[] calldata args
    ) external returns (bytes32 requestId) {
        require(allowedSubscriptions[subscriptionId], "Invalid subscription");
        
        FunctionsRequest.Request memory req;
        req.initializeRequestForInlineJavaScript(source);
        if (args.length > 0) req.setArgs(args);

        s_lastRequestId = _sendRequest(
            req.encodeCBOR(),
            subscriptionId,
            gasLimit,
            donID
        );

        return s_lastRequestId;
    }

    function fulfillRequest(
        bytes32 requestId,
        bytes memory response,
        bytes memory err
    ) internal override {
        if (s_lastRequestId != requestId) {
            revert UnexpectedRequestID(requestId);
        }
        s_lastResponse = response;
        Owner_ID = abi.decode(response, (uint256));
        s_lastError = err;

        emit Response(requestId, Owner_ID, s_lastResponse, s_lastError);
    }
}