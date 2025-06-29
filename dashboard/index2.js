// --- Global Variables ---
let contractABI = null;
const contractAddress = "0x477776da7d16723264f28a4319F23cA0e2F277eF";
let web3;
let contract;
let address = null;

// Assuming you have a known range or list of all possible property IDs
 // Example: Property IDs from 1 to 10

// --- DOM Elements (get them once for efficiency) ---
const dashboardLink = document.getElementById('dashboard-link');
const marketplaceLink = document.getElementById('marketplace-link');
const walletBtn = document.getElementById('wallet-btn');
const contentArea = document.getElementById('content-area');
const connectMessage = document.getElementById("connectMessage");


// --- Core Contract & Web3 Initialization ---
async function loadContractABI() {
    if (contractABI) return contractABI;
    try {
        const response = await fetch('./abi.json');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        contractABI = await response.json();
        console.log("ABI loaded successfully.");
        return contractABI;
    } catch (error) {
        console.error("Failed to load contract ABI:", error);
        contentArea.innerHTML = '<div class="error">Failed to load contract details.</div>';
        throw new Error("ABI load failed.");
    }
}

async function initializeContract() {
    if (window.ethereum) {
        if (!web3) { // Initialize Web3 only once
            web3 = new Web3(window.ethereum);
            console.log("Web3 provider initialized.");
        }

        if (!contractABI) { // Load ABI only once
            await loadContractABI();
        }

        if (contractABI && web3 && !contract) { // Initialize contract only once
            contract = new web3.eth.Contract(contractABI, contractAddress);
            console.log("Contract instance created.");
        } else if (!contract) {
             console.error("Contract ABI or Web3 not ready, cannot initialize contract.");
        }
    } else {
        console.error("No web3 provider detected.");
        if (connectMessage) {
            connectMessage.innerText = "No web3 provider detected. Please install MetaMask.";
        }
        throw new Error("No Web3 provider.");
    }
}


// --- Wallet Connection & Status Management ---
async function getConnectedWalletAddressSilent() {
    if (window.ethereum) {
        try {
            const accounts = await window.ethereum.request({ method: "eth_accounts" });
            return accounts.length > 0 ? accounts[0] : null;
        } catch (error) {
            console.error("Error fetching accounts silently:", error);
            return null;
        }
    }
    return null;
}

async function connectWallet() {
    if (window.ethereum) {
        try {
            const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
            if (accounts[0]) {
                console.log("Wallet connected:", accounts[0]);
                address = accounts[0];
                localStorage.setItem("walletAddress", address);
                updateWalletButtonUI(address);
                return true;
            }
        } catch (err) {
            if (err.code === 4001) {
                console.log("User rejected connection.");
                if (connectMessage) connectMessage.innerText = "Connection rejected. Please connect to MetaMask.";
            } else {
                console.error("Error requesting accounts:", err);
                if (connectMessage) connectMessage.innerText = "Error connecting wallet.";
            }
        }
    } else {
        console.error("No web3 provider detected");
        if (connectMessage) {
            connectMessage.innerText = "No web3 provider detected. Please install MetaMask.";
        }
    }
    updateWalletButtonUI(null);
    return false;
}

function updateWalletButtonUI(connectedAddress) {
    if (walletBtn) {
        if (connectedAddress) {
            walletBtn.textContent = `Connected: ${connectedAddress.substring(0, 6)}...${connectedAddress.substring(connectedAddress.length - 4)}`;
        } else {
            walletBtn.textContent = "Connect Wallet";
        }
    }
    if (connectMessage) connectMessage.innerText = "";
}

function convertWeiToEth(weiAmount) {
  const weiBigInt = BigInt(weiAmount);
  const ethConversionFactor = BigInt(10)**BigInt(18);
  const ethValue = Number(weiBigInt) / Number(ethConversionFactor);

  return ethValue.toString();
}


// --- Dashboard Loading Logic ---
async function loadDashboard() {
    contentArea.innerHTML = '<div class="loading">Loading dashboard...</div>';

    try {
        await initializeContract(); // Ensure Web3 and Contract are ready
        const allPropertyIds = await contract.methods.getAllPropertyIDs().call();

        if (!address) {
            const silentAddress = await getConnectedWalletAddressSilent();
            if (silentAddress) {
                address = silentAddress;
                updateWalletButtonUI(address);
                console.log("Wallet silently reconnected:", address);
            }
        }

        if (!address) {
            contentArea.innerHTML = '<div class="info">Please connect your wallet to view your owned properties.</div>';
            return;
        }

        const ownedPropertiesData = [];
        let totalYieldWei = web3.utils.toBN(0); // Initialize total yield as a BigNumber

        // Loop through all known property IDs
        for (const propertyId of allPropertyIds) {
            try {
                const ownedTokens = await contract.methods.balanceOf(address, propertyId).call();

                if (parseInt(ownedTokens) > 0) {
                    const propertyData = await contract.methods.getProperty(propertyId).call();
                    const availableYield = await contract.methods.getAvailableRewards(address, propertyId).call();

                    ownedPropertiesData.push({
                        id: propertyId,
                        data: propertyData,
                        ownedTokens: ownedTokens,
                        yield: availableYield // Store individual yield in Wei
                    });

                    totalYieldWei = totalYieldWei.add(web3.utils.toBN(availableYield)); // Add to total
                }
            } catch (propError) {
                console.warn(`Could not fetch data for property ID ${propertyId}:`, propError);
                // Continue to the next property even if one fails
            }
        }

        if (ownedPropertiesData.length > 0) {
            renderDashboardCards(ownedPropertiesData, totalYieldWei); // Pass totalYieldWei
            console.log("Dashboard loaded for address:", address);
            console.log("Owned Properties Data:", ownedPropertiesData);
            console.log("Total Yield (Wei):", totalYieldWei.toString());
        } else {
            contentArea.innerHTML = '<div class="info">You do not currently own any properties.</div>';
        }


    } catch (error) {
        console.error("Error loading dashboard:", error);
        contentArea.innerHTML = `<div class="error">Error loading dashboard: ${error.message || error}. <br>Please ensure your wallet is connected to the correct network and you own tokens.</div>`;
    }
}


// --- Render Dashboard UI (Now renders MULTIPLE cards and a TOTAL) ---
function renderDashboardCards(properties, totalYieldWei) {
    let allCardsHtml = '';

    if (properties.length === 0) {
        contentArea.innerHTML = '<div class="info">You do not currently own any properties.</div>';
        return;
    }

    properties.forEach(property => {
        const propertyId = property.id;
        const data = property.data;
        const ownedTokens = property.ownedTokens;
        const yieldAmount = property.yield; // Individual yield in Wei

        const propertyName = data.name || `Property ${propertyId}`;
        const rentPerMonth = data.rent ? `${web3.utils.fromWei(data.rent, 'ether')} ETH` : 'N/A';
        const formattedIndividualYield = yieldAmount ? `${web3.utils.fromWei(yieldAmount, 'ether')} ETH` : '0 ETH';

        let imageUrl = 'https://ipfs.io/ipfs/bafkreie54wce72ohazvk7fvanaziuawf7yikzvezdtd5adxtz25md5rxjm';
const propertyImageHtml = `<img src="${imageUrl}" alt="${propertyName} image">`;

        allCardsHtml += `
            <div class="dashboard-item">
                <div class="property-card">
                    <div class="property-image">${propertyImageHtml}</div>
                    <div class="property-name">${propertyName}</div>
                    <div class="property-info">
                        <div class="info-item">
                            <span class="info-label">Yield per month:</span>
                            <span class="info-value">${rentPerMonth}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">Tokens owned:</span>
                            <span class="info-value">${ownedTokens}</span>
                        </div>
                    </div>
                </div>
                <button class="claim-button" data-property-id="${propertyId}">
                    Claim Yield<br>
                    <span style="font-size: 16px; margin-top: 4px;">${formattedIndividualYield}</span>
                </button>
            </div>
        `;
    });

    const formattedTotalYield = web3.utils.fromWei(totalYieldWei, 'ether');

    contentArea.innerHTML = `
        <div class="dashboard-grid">${allCardsHtml}</div>
    `;

    // Attach event listener using event delegation for all claim buttons
    contentArea.querySelectorAll('.claim-button').forEach(button => {
        button.addEventListener('click', handleClaimButtonClick);
    });
}


// --- Handle Claim Button Click (Now reads property ID from button's data attribute) ---
async function handleClaimButtonClick(event) {
    const propertyId = event.currentTarget.dataset.propertyId; // Get property ID from the clicked button
    const claimBtn = event.currentTarget; // Reference to the specific button clicked

    try {
        if (!propertyId) {
            console.error('Property ID not found for claim button.');
            alert('Error: Could not determine property to claim for.');
            return;
        }

        if (!address) {
            console.error('No wallet connected. Prompting for connection.');
            alert('Please connect your wallet to claim rewards.');
            const connected = await connectWallet();
            if (!connected) return;
        }

        claimBtn.textContent = 'Claiming...';
        claimBtn.disabled = true;

        if (!contract) {
             await initializeContract();
             if (!contract) {
                throw new Error("Contract not initialized for claiming.");
             }
        }

        const transactionReceipt = await contract.methods.claimRewards(propertyId).send({
            from: address,
            gas: 400000 // Adjust gas limit as needed
        });

        console.log(`Claim rewards for Property ${propertyId} successful:`, transactionReceipt);
        alert(`Rewards claimed successfully for Property ID ${propertyId}! Transaction Hash: ` + transactionReceipt.transactionHash);

        await loadDashboard(); // Refresh dashboard to show updated yields

    } catch (error) {
        console.error(`Claim yield action for Property ${propertyId} failed:`, error);

        if (error.code === 4001 || (error.message && error.message.includes("User denied transaction signature."))) {
            alert('Transaction rejected by user.');
        } else {
            alert(`Failed to claim rewards for Property ${propertyId}: ${error.message || error}. Check console for details.`);
        }

        if (claimBtn) { // Ensure button exists before trying to reset
            claimBtn.textContent = 'Claim Yield';
            claimBtn.disabled = false;
        }
    }
}


// --- Navigation Functions ---
async function switchToView(view) {
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
    });

    if (view === 'dashboard') {
        dashboardLink.classList.add('active');
        await loadDashboard();
    }
}


// --- Initial Setup and Event Listeners on DOM Content Loaded ---
document.addEventListener('DOMContentLoaded', async () => {
    // Initial Web3 and Contract setup
    try {
        await initializeContract();
    } catch (e) {
        console.error("Initial contract setup failed:", e);
        contentArea.innerHTML = '<div class="error">Application could not initialize. Please check your internet connection and MetaMask.</div>';
        return;
    }

    // Attempt to get existing connected wallet silently
    address = await getConnectedWalletAddressSilent();
    updateWalletButtonUI(address);

    // Set up button click listeners
    if (walletBtn) {
        walletBtn.addEventListener('click', async () => {
            const connected = await connectWallet();
            if (connected) {
                await loadDashboard();
            }
        });
    }

    dashboardLink.addEventListener('click', (e) => {
        e.preventDefault();
        switchToView('dashboard');
    });

    marketplaceLink.addEventListener('click', (e) => {
        e.preventDefault();
        window.location.href = '../marketplace/index.html';
    });

    // Set up MetaMask event listeners (crucial for dynamic updates)
    if (window.ethereum) {
        window.ethereum.on('accountsChanged', async (newAccounts) => {
            if (newAccounts.length > 0) {
                address = newAccounts[0];
                localStorage.setItem("walletAddress", address);
                console.log("Account changed to:", address);
                updateWalletButtonUI(address);
                await loadDashboard();
            } else {
                address = null;
                localStorage.removeItem("walletAddress");
                console.log("Wallet disconnected from DApp.");
                updateWalletButtonUI(null);
                contentArea.innerHTML = '<div class="info">Wallet disconnected. Please connect to view dashboard.</div>';
            }
        });

        window.ethereum.on('chainChanged', (chainId) => {
            console.log("Network changed to:", chainId);
            window.location.reload();
        });
    }

    // Initial view load
    await switchToView('dashboard');
});


// externalFunctions (if still needed, adjust as per new flow)
const externalFunctions = {
    fetchDashboardData: async () => { /* ... */ },
    handleClaimYield: async (propertyData) => {
        console.log("handleClaimYield called, it's deprecated. Use direct button click.");
    },
    handleWalletConnect: async () => {
        console.log("handleWalletConnect called, redirecting to connectWallet");
        return await connectWallet();
    }
};

let currentView = 'dashboard';
let currentPropertyData = null;