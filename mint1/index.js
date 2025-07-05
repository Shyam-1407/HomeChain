let contractABI = null;

async function loadContractABI() {
   try {
       const response = await fetch('./abi.json');
       if (!response.ok) {
           throw new Error(`HTTP error! status: ${response.status}`);
       }
       contractABI = await response.json();
       console.log("ABI loaded successfully:", contractABI);
       return contractABI;
   } catch (error) {
       console.error("Failed to load contract ABI:", error);
       return null;
   }
}

const contractAddress = "0x477776da7d16723264f28a4319F23cA0e2F277eF";
let web3;
let contract;

async function initializeContract() {
   await loadContractABI();
   if (contractABI && window.ethereum) {
       web3 = new Web3(window.ethereum);
       contract = new web3.eth.Contract(contractABI, contractAddress);
   }
}

async function connectWallet() {
   if (window.ethereum) {
       try {
           const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
           if (accounts[0]) {
               console.log("We have an account");
           }
       } catch (err) {
           if (err.code === 4001) {
               console.log("Please connect to MetaMask.");
           } else {
               console.error(err);
           }
       }
       const connectBtn = document.getElementById("connect-btn")
       connectBtn.textContent = "Connected";
       connectBtn.disabled = true;
   } else {
       console.error("No web3 provider detected");
       document.getElementById("connectMessage").innerText = "No web3 provider detected. Please install MetaMask.";
   }
}

async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function getPropertyStatus(propertyID) {
    try {
        const property = await contract.methods.getProperty(propertyID).call();
        console.log(`Property ${propertyID} status: ${property.status}`);
        return property.status;
    } catch (error) {
        console.error("Error getting property status:", error);
        return null;
    }
}

// Check if property data contracts have valid values
async function checkPropertyDataReady(propertyDataContract) {
    try {
        const price = await propertyDataContract.methods.price().call();
        const rent = await propertyDataContract.methods.rent().call();
        console.log(`Property data - Price: ${price}, Rent: ${rent}`);
        return price > 0 && rent > 0;
    } catch (error) {
        console.error("Error checking property data:", error);
        return false;
    }
}

// Wait for property status to change to expected value
async function waitForStatusChange(propertyID, expectedStatus, timeout = 300000) { // 5 minutes timeout
    const startTime = Date.now();
    
    console.log(`Waiting for property ${propertyID} to reach status ${expectedStatus}...`);
    
    while (Date.now() - startTime < timeout) {
        try {
            const currentStatus = await getPropertyStatus(propertyID);
            
            if (currentStatus === expectedStatus) {
                console.log(`Property ${propertyID} reached expected status: ${expectedStatus}`);
                return true;
            }
            
            console.log(`Current status: ${currentStatus}, waiting for: ${expectedStatus}`);
            await delay(10000); // Check every 10 seconds
            
        } catch (error) {
            console.error("Error checking status:", error);
            await delay(5000); // Wait 5 seconds before retrying
        }
    }
    
    throw new Error(`Timeout: Property ${propertyID} did not reach status ${expectedStatus} within ${timeout/1000} seconds`);
}

// Wait for Chainlink oracle to update property data
async function waitForPropertyDataUpdate(timeout = 300000) {
    const startTime = Date.now();
    
    console.log("Waiting for Chainlink to update property data...");
   
    while (Date.now() - startTime < timeout) {
        try {
            console.log("Waiting for Chainlink oracle response...");
            await delay(15000); // Check every 15 seconds
            
            // Return true after reasonable wait time 
            if (Date.now() - startTime > 120000) { // 2 minutes
                console.log("Assuming property data is ready after 2 minutes");
                return true;
            }
            
        } catch (error) {
            console.error("Error checking property data:", error);
            await delay(10000);
        }
    }
    
    throw new Error(`Timeout: Property data not updated within ${timeout/1000} seconds`);
}

async function startregistartion(name, location, ownerID, propertyID) {
   try {
       console.log("🚀 Starting property registration...");
       const accounts = await window.ethereum.request({ method: 'eth_accounts' });
       
       await contract.methods.registerProperty(name, location, ownerID, propertyID).send({ 
           from: accounts[0],
           gas: 500000
       });
       console.log("Property registration transaction completed");
       
       console.log("Waiting for Chainlink to fetch Owner ID from API...");
       await delay(90000); // Wait 1.5 minutes for Chainlink to complete
       
   } catch (error) {
       console.error("Registration error:", error);
       throw error;
   }
}

async function processVerification(propertyID) {
    try {
        console.log("🔍 Starting verification process...");
        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
        
        // Check current status before proceeding
        const currentStatus = await getPropertyStatus(propertyID);
        if (currentStatus !== "1") {
            throw new Error(`Property not ready for verification. Expected status: 1, Current: ${currentStatus}`);
        }
        
        await contract.methods.processVerification(propertyID).send({ 
            from: accounts[0],
            gas: 500000
        });
        
        console.log("Verification process completed successfully");
        
        // After verification, wait for property data to be requested
        console.log("Waiting for property data Chainlink request...");
        await delay(90000); // Wait 1.5 minutes for the property data request to be sent
        
    } catch (error) {
        console.error("Verification error:", error);
        throw error;
    }
}
async function metauriMaker(id) {
    try {
        const property = await contract.methods.getProperty(id).call();
        const _name = property.name;
        const location = property.location;
        const price = property.price;
        const rent = property.rent;

        // Create metadata object
        const metadata = {
            "name": `Property #${id}`,
            "description": `Real Estate Property Token - ${_name} located in ${location}. This NFT represents fractional ownership of the property.`,
            "image": "https://ipfs.io/ipfs/bafkreie54wce72ohazvk7fvanaziuawf7yikzvezdtd5adxtz25md5rxjm",
            "attributes": [
                {
                    "trait_type": "Property Name",
                    "value": _name
                },
                {
                    "trait_type": "Location",
                    "value": location
                },
                {
                    "trait_type": "Property Value",
                    "value": price
                },
                {
                    "trait_type": "Monthly Rent",
                    "value": rent
                }
            ]
        };

        // Convert metadata to JSON string
        const metadataJSON = JSON.stringify(metadata, null, 2);
        
        // Upload to IPFS or create data URI
        const metadataURI = await uploadMetadataToIPFS(metadataJSON);
        
        console.log("Generated metadata:", metadata);
        console.log("Metadata URI:", metadataURI);
        
        return metadataURI;
        
    } catch (error) {
        console.error("Error creating metadata:", error);
        throw new Error(`Failed to create metadata for property ${id}: ${error.message}`);
    }
}

async function uploadMetadataToIPFS(metadataJSON) {
    try {
        // Option 1: Use Pinata API
        const pinataResponse = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'pinata_api_key': '9dfc4c4cbe1fb8cb4b17',
                'pinata_secret_api_key': '163d3d8a4d8e7f0967d4160d98efdfcd45d78eca9b1a0d46a888657ba0bddd20'
            },
            body: JSON.stringify({
                pinataContent: JSON.parse(metadataJSON),
                pinataMetadata: {
                    name: `property-metadata-${Date.now()}.json`
                }
            })
        });
        
        if (!pinataResponse.ok) {
            throw new Error(`Pinata upload failed: ${pinataResponse.status}`);
        }
        
        const pinataResult = await pinataResponse.json();
        return `https://gateway.pinata.cloud/ipfs/${pinataResult.IpfsHash}`;
        
    } catch (error) {
        console.error("IPFS upload failed, using data URI fallback:", error);
        const base64Metadata = btoa(metadataJSON);
        return `data:application/json;base64,${base64Metadata}`;
    }
}

async function mint(id, metauri) {
   try {
       updateButtonStatus("Minting...");
       console.log("Minting started");
       const accounts = await window.ethereum.request({ method: 'eth_accounts' });
       
       await contract.methods.setTokenPriceAndMint(id, metauri).send({ 
           from: accounts[0],
           gas: 500000
       });
       console.log("token minted successfully");
       updateButtonStatus("Completed")
        window.location.href = "../mint2/index.html";
       
   } catch (error) {
       console.error("Mint error:", error);
       throw error;
   }
}

async function processPropertyData(propertyID) {
    try {
        console.log("Starting property data processing...");
        
        // Check current status before proceeding
        const currentStatus = await getPropertyStatus(propertyID);
        if (currentStatus !== "2") {
            throw new Error(`Property not ready for data processing. Expected status: 2, Current: ${currentStatus}`);
        }
        
        const accounts = await window.ethereum.request({method: 'eth_accounts' });
        const maxRetries = 2; // Try for up to 2 attempts (about 2 minutes)
        let retryCount = 0;
        
        while (retryCount < maxRetries) {
            try {
                console.log(`Attempt ${retryCount + 1}/${maxRetries} - Checking if property data is ready...`);
                
                // Try to call the function - if it fails, wait and retry
                await contract.methods.processPropertyData(propertyID).send({
                    from: accounts[0],
                    gas: 500000
                });
                
                console.log("Property data processing completed successfully");
                return; // Success, exit the function
                
            } catch (error) {
                if (error.message.includes("Invalid data")) {
                    retryCount++;
                    console.log(`Oracle data not ready yet. Waiting 30 seconds before retry ${retryCount}/${maxRetries}...`);
                    
                    if (retryCount >= maxRetries) {
                        throw new Error("Timeout: Property data oracle did not respond after maximum retries");
                    }
                    
                    await delay(30000); // Wait 30 seconds before retry
                } else {
                    // Different error, don't retry
                    throw error;
                }
            }
        }
        
    } catch (error) {
        console.error("Property Data error:", error);
        throw error;
    }
}

function updateButtonStatus(text) {
    const nextBtn = document.getElementById("next-btn");
    nextBtn.innerText = text;
}

async function handleCompletePropertyProcess(name, location, ownerID, propertyID) {
    try {
        const nextBtn = document.getElementById("next-btn");
        const originalText = nextBtn.innerText;
        nextBtn.disabled = true;
        
        console.log("Starting complete property registration workflow...");
        
        // Step 1: Registration
        updateButtonStatus("Registering...");
        console.log("Step 1: Starting property registration");
        await startregistartion(name, location, ownerID, propertyID);
        
        // Step 2: Verification
        updateButtonStatus("Verifying...");
        console.log("Step 2: Starting verification process");
        await processVerification(propertyID);
        
        // Step 3: Data Processing (with proper waiting)
        updateButtonStatus("Processing Data...");
        console.log("Step 3: Starting property data processing");  
        await processPropertyData(propertyID);
        
        console.log("All processes completed successfully!");
        alert("Property registration completed successfully!");
        
        nextBtn.disabled = false;
        nextBtn.innerText = originalText;
        
    } catch (error) {
        console.error("Complete workflow error:", error);
        alert(`Error: ${error.message}`);
        
        const nextBtn = document.getElementById("next-btn");
        nextBtn.disabled = false;
        nextBtn.innerText = "Register Property";
    }
}

initializeContract();

document.getElementById("connect-btn").addEventListener("click", connectWallet);
document.getElementById("next-btn").addEventListener("click", async () => {
   const name = document.getElementById("PN").value;
   const location = document.getElementById("PL").value;
   const OwnerID = document.getElementById("OID").value;
   const propertyID = document.getElementById("PID").value;

   if (!name || !location || !OwnerID || !propertyID) {
       alert("Please fill in all fields");
       return;
   }

   try {
       await handleCompletePropertyProcess(name, location, OwnerID, propertyID);
   } catch (error) {
       console.error("Main process error:", error);
   }

   try {
      updateButtonStatus("Minting...");
      await delay(30000);
      const metadata = await metauriMaker(propertyID); // Added 'await' here
      await mint(propertyID, metadata);
   }
   catch (error){
      console.error("Mint error:", error);
   }

});
