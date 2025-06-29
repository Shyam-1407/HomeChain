// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {FunctionsClient} from "@chainlink/contracts@1.4.0/src/v0.8/functions/v1_0_0/FunctionsClient.sol";
import {ConfirmedOwner} from "@chainlink/contracts@1.4.0/src/v0.8/shared/access/ConfirmedOwner.sol";
import {FunctionsRequest} from "@chainlink/contracts@1.4.0/src/v0.8/functions/v1_0_0/libraries/FunctionsRequest.sol";

contract PropertyData is FunctionsClient, ConfirmedOwner {
    using FunctionsRequest for FunctionsRequest.Request;

    bytes32 public s_lastRequestId;
    bytes public s_lastResponse;
    bytes public s_lastError;

    // ADDED: Only allow specific subscription IDs
    mapping(uint64 => bool) public allowedSubscriptions;

    error UnexpectedRequestID(bytes32 requestId);

    event Response(
        bytes32 indexed requestId,
        uint256 price,
        uint256 rent,
        bytes response,
        bytes err
    );

    address router = 0xb83E47C2bC239B3bf370bc41e1459A34b41238D0;

    string source =
        "\"use strict\";"
        "const propertyId = args[0];"
        "if (!propertyId) {"
        "  throw Error(\"Property ID is required as the first argument.\");"
        "}"
        "const apiUrl = `https://property-api-9b2o.onrender.com/api/${propertyId}`;"
        "const propertyRequest = Functions.makeHttpRequest({"
        "  url: apiUrl,"
        "  method: \"GET\","
        "  headers: {"
        "    \"Content-Type\": \"application/json\","
        "  },"
        "  timeout: 10000,"
        "});"
        "const propertyResponse = await propertyRequest;"
        "if (propertyResponse.error) {"
        "  throw Error(`API request failed: ${propertyResponse.error.message || propertyResponse.error}`);"
        "}"
        "if (propertyResponse.status !== 200) {"
        "  throw Error(`HTTP error fetching property data: Status ${propertyResponse.status}. Body: ${propertyResponse.data || \"No body\"}`);"
        "}"
        "const propertyData = propertyResponse.data;"
        "if (!propertyData) {"
        "  throw Error(\"No property data received from API or data is empty.\");"
        "}"
        "const price = propertyData.price || 0;"
        "const rent = propertyData.rent || 0;"
        "const encodedPrice = Functions.encodeUint256(Math.floor(price));"
        "const encodedRent = Functions.encodeUint256(Math.floor(rent));"
        "const totalLength = encodedPrice.length + encodedRent.length;"
        "const combinedBytes = new Uint8Array(totalLength);"
        "let offset = 0;"
        "combinedBytes.set(encodedPrice, offset);"
        "offset += encodedPrice.length;"
        "combinedBytes.set(encodedRent, offset);"
        "return combinedBytes;";

    uint32 gasLimit = 300000;
    bytes32 donID = 0x66756e2d657468657265756d2d7365706f6c69612d3100000000000000000000;
    
    uint256 public price;
    uint256 public rent;

    constructor() FunctionsClient(router) ConfirmedOwner(msg.sender) {
        // ADDED: Pre-authorize subscription IDs (you can add the specific subscription ID used by your main contract)
        allowedSubscriptions[4992] = true;
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
        s_lastError = err;
        
        // Parse the response to extract price and rent
        (price, rent) = abi.decode(response, (uint256, uint256));

        emit Response(
            requestId,
            price,
            rent,
            s_lastResponse,
            s_lastError
        );
    }

    // ADDED: Function to manage allowed subscriptions (only owner can call)
    function setAllowedSubscription(uint64 subscriptionId, bool allowed) external onlyOwner {
        allowedSubscriptions[subscriptionId] = allowed;
    }
}