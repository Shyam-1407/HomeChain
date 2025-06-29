// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IVerification {
    function Owner_ID() external view returns (uint256);
    function sendRequest(uint64 subscriptionId, string[] calldata args) external returns (bytes32);
}

interface IPropertyData {
    function price() external view returns (uint256);
    function rent() external view returns (uint256);
    function sendRequest(uint64 subscriptionId, string[] calldata args) external returns (bytes32); 
}

contract RealEstate is ERC1155, Ownable, ReentrancyGuard {
    using Strings for uint256;
    
    // Constants
    uint64 public constant VERIFICATION_SUB_ID = 4949;
    uint64 public constant PROPERTY_DATA_SUB_ID = 4992;
    uint8 public constant DIST_RATE = 75;
    uint8 public constant VACANCY_RATE = 8;
    uint8 public constant TARGET_ROI = 12;
    uint8 public constant TOTAL_TOKENS = 100;
    uint8 public constant PLATFORM_FEE = 10;

    // Immutable contracts
    IVerification public immutable verification;
    IPropertyData public immutable propertyData;

    // Enums
    enum Status { None, PendingVerify, PendingData, Active, Inactive }

    // Main property data
    struct Property {
        string name;
        string location;
        string metadataURI;
        address owner;
        uint256 tenantcode;
        uint256 ownerID;
        uint256 rent;
        uint256 price;
        uint256 totalRent;
        Status status;
    }

    // Optimized rent tracking
    struct RentRecord {
        uint256 amount;
        uint256 forHolders;
        uint32 timestamp;
    }

    // State
    mapping(uint256 => Property) public properties;
    mapping(uint256 => RentRecord[]) public rentRecords;
    mapping(uint256 => uint256) public rentPools;
    mapping(uint256 => mapping(address => uint256)) public lastClaimed;
    uint256[] public propIDs;

    // Events (shortened names)
    event PropRegStarted(uint256 indexed id, string name, uint256 ownerID);
    event VerifyDone(uint256 indexed id, bool verified);
    event DataDone(uint256 indexed id, uint256 price, uint256 rent);
    event PropAdded(uint256 indexed id);
    event TokenPriceSet(uint256 indexed id);
    event TenantSet(uint256 indexed id, address tenant);
    event RentPaid(uint256 indexed id, uint256 amount);
    event RewardsClaimed(address indexed user, uint256 indexed id, uint256 amount);

    constructor(address owner, address verifyAddr, address dataAddr) 
        ERC1155("") 
        Ownable(owner) 
    {
        require(verifyAddr != address(0) && dataAddr != address(0), "Invalid addresses");
        verification = IVerification(verifyAddr);
        propertyData = IPropertyData(dataAddr);
    }

    modifier exists(uint256 id) {
        require(properties[id].ownerID != 0, "Nope property not found");
        _;
    }

    modifier isOwner(uint256 id) {
        require(properties[id].owner == msg.sender,"Not owner");
        _;
    }

    // Step 1: Register property
    function registerProperty(string calldata name, string calldata location, uint256 ownerID, uint256 id) external {
        require(bytes(name).length > 0 && bytes(location).length > 0, "Empty data");
        require(ownerID != 0 && id != 0, "Invalid IDs");
        require(properties[id].ownerID == 0, "Exists");

        uint256 code = tenantcodegenerator();

        properties[id] = Property({
            name: name,
            location: location,
            metadataURI: "",
            tenantcode: code,
            ownerID: ownerID,
            owner: msg.sender,
            rent: 0,
            price: 0,
            totalRent: 0,
            status: Status.PendingVerify
        });

        string[] memory args = new string[](1);
        args[0] = id.toString();
        verification.sendRequest(VERIFICATION_SUB_ID, args);

        emit PropRegStarted(id, name, ownerID);
    }

    // Step 2: Process verification
    function processVerification(uint256 id) external exists(id) {
        require(properties[id].status == Status.PendingVerify, "Wrong status");

        if (verification.Owner_ID() == properties[id].ownerID) {
            properties[id].status = Status.PendingData;
            
            string[] memory args = new string[](1);
            args[0] = id.toString();
            propertyData.sendRequest(PROPERTY_DATA_SUB_ID, args);
            
            emit VerifyDone(id, true);
        } else {
            delete properties[id];
            emit VerifyDone(id, false);
        }
    }

    // Step 3: Process property data
    function processPropertyData(uint256 id) external {
        require(properties[id].status == Status.PendingData, "Wrong status");

        uint256 price = propertyData.price();
        uint256 rent = propertyData.rent();
        require(price > 0 && rent > 0, "Invalid data");

        properties[id].price = price;
        properties[id].rent = rent;
        properties[id].status = Status.Active;
        propIDs.push(id);

        emit DataDone(id, price, rent);
        emit PropAdded(id);
    }

    // Step 4: Set token price and mint
    function setTokenPriceAndMint(uint256 id, string calldata metadataURI) external isOwner(id) exists(id) {
        require(properties[id].status == Status.Active, "Not ready");
        require(bytes(metadataURI).length > 0, "Empty URI");

        properties[id].metadataURI = metadataURI;
        
        _mint(owner(), id, TOTAL_TOKENS, "");
        emit TokenPriceSet(id);
    }

    // Tenant code generator
    function tenantcodegenerator() internal view returns (uint256) {
        uint256 seed = uint256(
            keccak256(
                abi.encodePacked(
                    block.timestamp,
                    block.prevrandao,
                    msg.sender
                )
            )
        );
        return (seed % 9000) + 1000; // Ensures 1000–9999
    }

    // Rent payment
    function payRent(uint256 id, uint256 code) external payable nonReentrant {
        require(code == properties[id].tenantcode, "Invalid code");
        require(msg.value == properties[id].rent, "Incorrect amount");

        
        properties[id].totalRent += msg.value;
        
        uint256 platformFee = (msg.value * PLATFORM_FEE) / 100;
        uint256 forHolders = msg.value - platformFee;
        
        rentRecords[id].push(RentRecord({
            amount: msg.value,
            forHolders: forHolders,
            timestamp: uint32(block.timestamp)
        }));
        
        rentPools[id] += forHolders;
        payable(owner()).transfer(platformFee);
        
        emit RentPaid(id, msg.value);
    }

    // Simplified reward claiming
    function claimRewards(uint256 id) external nonReentrant {
        uint256 userTokens = balanceOf(msg.sender, id);
        require(userTokens > 0, "No tokens");
        
        uint256 totalDistributed = 0;
        uint256 userClaimed = lastClaimed[id][msg.sender];
        
        for (uint256 i = userClaimed; i < rentRecords[id].length; i++) {
            totalDistributed += (rentRecords[id][i].forHolders * userTokens) / TOTAL_TOKENS;
        }
        
        require(totalDistributed > 0, "Nothing to claim");
        
        lastClaimed[id][msg.sender] = rentRecords[id].length;
        payable(msg.sender).transfer(totalDistributed);
        
        emit RewardsClaimed(msg.sender, id, totalDistributed);
    }

    // View functions
    function getProperty(uint256 id) external view returns (Property memory) {
        return properties[id];
    }

    function getAvailableRewards(address user, uint256 id) external view returns (uint256) {
        uint256 userTokens = balanceOf(user, id);
        if (userTokens == 0) return 0;
        
        uint256 totalDistributed = 0;
        uint256 userClaimed = lastClaimed[id][user];
        
        for (uint256 i = userClaimed; i < rentRecords[id].length; i++) {
            totalDistributed += (rentRecords[id][i].forHolders * userTokens) / TOTAL_TOKENS;
        }
        
        return totalDistributed;
    }

    function getAllPropertyIDs() external view returns (uint256[] memory) {
        return propIDs;
    }

    // Admin functions
    function emergencyWithdraw() external onlyOwner {
        payable(owner()).transfer(address(this).balance);
    }

    function uri(uint256 tokenId) public view override returns (string memory) {
        if (properties[tokenId].ownerID != 0 && bytes(properties[tokenId].metadataURI).length > 0) {
            return properties[tokenId].metadataURI;
        }
        return super.uri(tokenId);
    }

    receive() external payable {}
}