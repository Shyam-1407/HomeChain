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
       const connectBtn = document.getElementById("wallet-btn")
       connectBtn.textContent = "Connected";
   } else {
       console.error("No web3 provider detected");
       document.getElementById("connectMessage").innerText = "No web3 provider detected. Please install MetaMask.";
   }
}

function convertWeiToEth(weiAmount) {
  const weiBigInt = BigInt(weiAmount);
  const ethConversionFactor = BigInt(10)**BigInt(18);
  const ethValue = Number(weiBigInt) / Number(ethConversionFactor);

  return ethValue.toString();
}

const externalFunctions = {
fetchPropertyData: async () => {
        return new Promise(resolve => {
            setTimeout(() => {
                resolve({
                    name: "Name",
                    location: "Location",
                    rentPrice: "0 eth",
                    tokenPrice: "0 eth",
                    propertyPrice: "0 eth",
                    image: null
                });
            }, 1000);
        });
    },

    handleBuy: async (propertyData) => {
        alert('Buy function triggered!');
        return true;
    },

    handlePayRent: async (propertyData) => {
        alert('Pay Rent function triggered!');
        return true;
    },

    handleWalletConnect: async () => {
        alert('Wallet connection triggered!');
        return 'Connected Wallet Address';
    }
};

let currentPropertyData = null;

const dashboardLink = document.getElementById('dashboard-link');
const marketplaceLink = document.getElementById('marketplace-link');
const walletBtn = document.getElementById('wallet-btn');
const contentArea = document.getElementById('content-area');

dashboardLink.addEventListener('click', (e) => {
    e.preventDefault();
    window.location.href = '../dashboard/index.html';
});

marketplaceLink.addEventListener('click', (e) => {
    e.preventDefault();
    loadMarketplace();
});

walletBtn.addEventListener('click', async () => {
    await connectWallet();
});

async function loadMarketplace() {
    contentArea.innerHTML = '<div class="loading">Loading properties...</div>';

    try {
        await initializeContract();
        const array = await contract.methods.getAllPropertyIDs().call();
        console.log(array);
        const id = array[array.length -1];
        const propertyData = await contract.methods.getProperty(id).call();
        renderPropertyCard(propertyData, id);
    } catch (error) {
        contentArea.innerHTML = '<div class="loading">Error loading properties</div>';
        throw error;
    }
}

function renderPropertyCard(data, id) {
    contentArea.innerHTML = `
        <div class="property-card">
            <div class="property-image">
            </div>
            <div class="property-info">
                <div class="property-name">${data.name} </div>
                <div class="property-location">${data.location} </div>
            </div>
            <div class="price-section">
                <div class="price-item">
                    <div class="price-label">Rent Price</div>
                    <div class="price-value">${convertWeiToEth(data.rent)} eth</div>
                </div>
                <div class="price-item">
                    <div class="price-label">Property No</div>
                    <div class="price-value">${id}</div>
                </div>
                <div class="price-item">
                    <div class="price-label">Property Price</div>
                    <div class="price-value">${convertWeiToEth(data.price)} eth</div>
                </div>
            </div>
            <div class="action-buttons">
                <button class="btn btn-buy" id="buy-btn">Buy</button>
                <button class="btn btn-rent" id="rent-btn">Pay Rent</button>
            </div>
        </div>
    `;

    document.getElementById('buy-btn').addEventListener('click', async () => {
        window.location.href = 'https://testnets.opensea.io/assets/sepolia/0x477776da7d16723264f28a4319f23ca0e2f277ef/11'
    });

    document.getElementById('rent-btn').addEventListener('click', (e) => {
    e.preventDefault();
    window.location.href = '../rent/index.html';
});
}

window.addEventListener('DOMContentLoaded', () => {
    loadMarketplace();
});