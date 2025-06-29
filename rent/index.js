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



//function calculateTokenPrice(propertyPrice, monthlyRent) {
//  const d = 0.70;  // 70% distribution rate
//  const v = 0.10;  // 10% vacancy rate
//  const r = 0.08;  // 8% target ROI
//  
//  const R = (monthlyRent * 12) * 0.80; // Net annual rent (20% operating expenses)
//  
//  return (R * d * (1 - v)) / (100 * r);
//}

async function getAccessCode(id) {
    try {
        const property = await contract.methods.getProperty(id).call();
        return property.tenantcode;
    }
    catch (err) {
        console.error('Error getting access code:', err);
        return null;
    }
}

function convertWeiToEth(weiAmount) {
  const weiBigInt = BigInt(weiAmount);
  const ethConversionFactor = BigInt(10)**BigInt(18);
  const ethValue = Number(weiBigInt) / Number(ethConversionFactor);

  return ethValue.toString();
}

async function getRent(id) {

    // Get property details and verify access code
    const property = await contract.methods.getProperty(id).call();

    // Get rent amount from property
    const rentAmountINR = property.rent;

    // Convert rent amount to ETH
    // const rentAmountETH = await rupeesToEth(rentAmountINR);
        
    // if (!rentAmountETH) {
    //     throw new Error('Failed to convert rupees to ETH');
    // }

    return rentAmountINR;
}

async function payRent(id, accesscode) {
    try {
        const accounts = await web3.eth.getAccounts();
        const fromAccount = accounts[0];
            
        // if (!fromAccount) {
        //     throw new Error('No wallet connected');
        // }

        // const rentAmountETH = await getRent(id);

        // Convert to Wei (ETH's smallest unit)
        //const rentAmountWei = web3.utils.toWei(rentAmountETH.toString(), 'ether');

        const rentAmountWei = await getRent(id);

        // Send transaction
        const result = await contract.methods.payRent(id, accesscode).send({
            from: fromAccount,
            value: rentAmountWei,
            gas: 400000 // Adjust gas limit as needed
        });

        return {
            success: true,
            transactionHash: result.transactionHash,
            rentPaidWei: rentAmountWei
        };

    } catch (err) {
        console.error('Error paying rent:', err);
        return {
            success: false,
            error: err.message
        };
    }
}

// // Set amount when page loads
// document.addEventListener('DOMContentLoaded', () => {
//     const amount = calculateRentAmount();
//     document.getElementById('amount-display').textContent = `${amount} eth`;
// });

document.getElementById("connect-btn").addEventListener("click", async ()=> {
    await initializeContract();
    connectWallet();

    const array = await contract.methods.getAllPropertyIDs().call();
    console.log(array);
    const id = array[array.length -1];
    const rentamount = await getRent(id);

    const rentAmountEth = convertWeiToEth(rentamount);
    document.getElementById('amount-display').textContent = `${rentAmountEth} eth`

});

// Example of using the access code on Pay Rent click
document.getElementById('pay-btn').addEventListener('click', async () => {
const accessCode = document.getElementById('access-code').value.trim();

const array = await contract.methods.getAllPropertyIDs().call();
console.log(array);
const id = array[array.length -1];

if (accessCode) {
    const result = await payRent(id, accessCode);
        
    if (result.success) {
        console.log(`Rent paid successfully! TX: ${result.transactionHash}`);
        console.log(`Amount: ${result.rentPaidETH.toFixed(6)} ETH`);
    } else {
        console.error('Rent payment failed:', result.error);
    }
}
});