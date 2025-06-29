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

async function getdata() {

    await initializeContract();
    const array = await contract.methods.getAllPropertyIDs().call();
    console.log(array);
    const id = array[array.length -1];
    console.log(id);
    const property = await contract.methods.getProperty(id).call();

    document.getElementById("property-id").innerText = id;
    document.getElementById("property-name").innerText = property.name;
    document.getElementById("property-location").innerText = property.location;
    document.getElementById("tenant-code").innerText = property.tenantcode;

}

window.addEventListener('DOMContentLoaded', async () => {
    await getdata();
});