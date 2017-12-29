const SHA256 = require('crypto-js/sha256')
const fs = require('fs')
// --------------------------------------------------------------------------
class Block {
  constructor (data = [], previousHash = undefined, index = undefined) {
    this.index = index
    this.timestamp = new Date()
    this.data = data
    this.previousHash = previousHash
    this.hash = this.calculateHash()
    this.nonce = 0
  }

  calculateHash () {
    return SHA256(this.index + this.previousHash + this.timestamp + this.data + this.nonce).toString()
  }

  mineBlock (difficulty) {
    while (this.hash.substring(0, difficulty) !== Array(difficulty + 1).join('0')) {
      this.nonce++
      this.hash = this.calculateHash()
    }
    console.log('Block mined:', this.hash)
    return true
  }
}
// --------------------------------------------------------------------------
class Transaction {
  constructor (fromWallet, toWallet) {
    this.fromWallet = fromWallet
    this.toWallet = toWallet
    this.transferCoins = []
  }

  addCoinToTransaction (coinHash) {
    this.transferCoins.push(coinHash)
  }
}
// --------------------------------------------------------------------------
class Wallet {
  constructor (publicRandomInput, publicRandomInput2) {
    this.publicAddress = SHA256(publicRandomInput).toString()
    this.privateKey = SHA256(publicRandomInput2).toString()
    this.createdTimestamp = new Date()
    this.ownedCoins = []
  }

  calculateAuthHash () {
    return SHA256(this.publicAddress + this.privateKey + this.createdTimestamp).toString()
  }

  getPublicAddress () {
    return this.publicAddress
  }

  setCoins (coinHash) {
    this.ownedCoins[coinHash] = coinHash
  }
}
// --------------------------------------------------------------------------
class Coin {
  constructor (previousCoinHash, createdBlock, owner, previousOwner) {
    this.previousCoinHash = previousCoinHash
    this.createdTimestamp = new Date()
    this.createdOnBlock = createdBlock
    this.hash = this.calculateHash()
    this.previousOwner = previousOwner
    this.owner = owner
    this.avaliable = true
  }

  calculateHash () {
    return SHA256(this.createdTimestamp + this.createdOnBlock + this.previousCoinHash).toString()
  }

  getOwner () {
    return this.owner
  }

  setNewOwner (newOwner) {
    this.previousOwner = this.owner
    this.owner = newOwner
  }

  pending () {
    this.avaliable = false
  }

  confirmed () {
    this.avaliable = true
  }
}
// --------------------------------------------------------------------------
class Blockchain {
  constructor () {
    this.chain = [this.createGenesisBlock()]
    this.wallets = {}
    this.memoryPool = []
    this.circulation = [this.createGenesisCoin()]
    this.difficulty = 4
  }

  createGenesisBlock () {
    return new Block('Genesis block!', '**00/00**', 0)
  }

  createGenesisCoin () {
    return new Coin('Gensis Coin!', '**00/00**', 'Genesis Coin')
  }

  getLatestBlock () {
    return this.chain[this.chain.length - 1]
  }

  getLatestCoin () {
    return this.circulation[this.circulation.length - 1]
  }

  getCoin (coinHash) {
    let coinIndex = this.indexByAttr(this.circulation, 'hash', coinHash)
    if (coinIndex !== -1) {
      return this.circulation[coinIndex]
    }
  }

  getWalletBalance (targetWalletID) {
    let targetWallet = this.wallets[targetWalletID]
    let balance = 0

    if (targetWallet !== undefined) {
      targetWallet.ownedCoins.forEach((coinHash) => {
        let coin = this.getCoin(coinHash)
        if (coin.avaliable) {
          balance = balance + 1
        }
      })
    }
    return balance
  }

  addBlock () {
    let newBlock = new Block()
    // Auto generate the index
    if (!newBlock.index) {
      newBlock.index = this.getLatestBlock().index + 1
    }
    // Get previous block hash
    newBlock.previousHash = this.getLatestBlock().hash
    // Set data into the block
    newBlock.data = this.memoryPool
    newBlock.hash = newBlock.calculateHash()
    // Compute latest hash for current block
    if (newBlock.mineBlock(this.difficulty)) {
      for (let i = 0; i < newBlock.data.length; i++) {
        let pendingTransaction = newBlock.data[i]
        this.confirmTransaction(pendingTransaction)
      }
    }
    // Add to chain
    this.chain.push(newBlock)
    // Reset the memory pool once the transaction have been added to block
    this.memoryPool = []
  }

  createWallet (randomInput1, randomInput2, amount) {
    let wallet = new Wallet(randomInput1, randomInput2)
    if (wallet.publicAddress) {
      this.wallets[wallet.publicAddress] = wallet
      // Generate coins
      for (let i = 0; i < amount; i++) {
        let coin = this.createCoin(wallet.publicAddress, amount)
        wallet.ownedCoins.push(coin.hash)
      }
      return wallet
    }
    return undefined
  }

  createCoin (owner, amount) {
    let coin = new Coin(this.getLatestCoin().hash, this.getLatestBlock().hash, owner, owner)
    this.circulation.push(coin)
    return coin
  }

  createTransaction (fromWallet, fromWalletPK, toWallet, amount) {
    let senderWallet = this.wallets[fromWallet]
    let recieverWallet = this.wallets[toWallet]

    if (senderWallet && recieverWallet) {
      // Check if enough enough non spent coin exists within the wallet
      let walletBalance = this.getWalletBalance(senderWallet.publicAddress)
      if (walletBalance >= amount) {
        // Check if wallet is authorised to make payment
        let thisTransactionAuthHash = SHA256(fromWallet + fromWalletPK + senderWallet.createdTimestamp).toString()
        if (thisTransactionAuthHash === senderWallet.calculateAuthHash()) {
          // Create a new transaction
          let newTransaction = new Transaction(senderWallet.publicAddress, recieverWallet.publicAddress)
          // Add coins to the transaction for sending if avaliable
          let avaliableCoins = []
          senderWallet.ownedCoins.forEach((coinHash) => {
            // Get avaliable coins from the wallet
            let coin = this.getCoin(coinHash)
            if (coin.avaliable) {
              avaliableCoins.push(coin)
            }
          })
          // Transfer amount of avaliable coins
          for (let i = 0; i < amount; i++) {
            let coin = avaliableCoins[i]
            newTransaction.addCoinToTransaction(coin.hash)
            coin.pending()
          }

          this.memoryPool.push(newTransaction)
          console.log('Transaction successfully added to memory pool!')
        } else {
          console.log('Not authorised!')
        }
      } else {
        console.log('Insufficient balance!')
      }
    } else {
      console.log('From or To wallets not found!')
    }
  }

  confirmTransaction (transaction) {
    let senderWallet = this.wallets[transaction.fromWallet]
    let recieverWallet = this.wallets[transaction.toWallet]
    let coin
    if (senderWallet && recieverWallet) {
      if (senderWallet.ownedCoins.length >= transaction.transferCoins.length) {
        for (let i = 0; i < transaction.transferCoins.length; i++) {
          // Get coin from owner and remove it from their wallet.
          let ownerCoinIndex = senderWallet.ownedCoins.indexOf(transaction.transferCoins[i])
          if (ownerCoinIndex !== -1 || ownerCoinIndex !== undefined) {
            coin = this.getCoin(senderWallet.ownedCoins[ownerCoinIndex])
            senderWallet.ownedCoins.splice(ownerCoinIndex, 1)
          } else {
            console.log('OwnerCoinIndex not found', ownerCoinIndex)
          }
          // Check if coin not in reciept wallet, if not then add, update coin details and make it avaliable
          let newOwnerCoinIndex = this.indexByAttr(recieverWallet.ownedCoins, 'hash', transaction.transferCoins[i])
          if (!newOwnerCoinIndex) {
            recieverWallet.ownedCoins.push(coin.hash)
            coin.setNewOwner(recieverWallet.publicAddress)
            coin.confirmed()
          }
        }
      }
    }
  }

  indexByAttr (arr, attr, value) {
    var i = arr.length
    while (i--) {
      if (arr[i] && arr[i].hasOwnProperty(attr) && arr[i][attr] === value) {
        return i
      }
    }
  }

  isChainValid () {
    for (let i = 1; i < this.chain.length; i++) {
      const currentBlock = this.chain[i]
      const previousBlock = this.chain[i - 1]

      if (currentBlock.hash !== currentBlock.calculateHash()) {
        return false
      }

      if (currentBlock.previousHash !== previousBlock.hash) {
        return false
      }
    }
    return true
  }
}
// --------------------------------------------------------------------------
// Execute Blockchain stuff...
let jCoin = new Blockchain()
// Create wallets
let wallet1 = jCoin.createWallet('abc', '123', 5)
let wallet2 = jCoin.createWallet('def', '456', 5)

// Create some transactions
jCoin.createTransaction(wallet1.publicAddress, wallet1.privateKey, wallet2.publicAddress, 1)
jCoin.createTransaction(wallet1.publicAddress, wallet1.privateKey, wallet2.publicAddress, 2)
jCoin.createTransaction(wallet1.publicAddress, wallet1.privateKey, wallet2.publicAddress, 1)
// Add transactions to blockchain
console.log('Mining block 1...')
jCoin.addBlock()

// Create some transactions
jCoin.createTransaction(wallet2.publicAddress, wallet2.privateKey, wallet1.publicAddress, 1)
jCoin.createTransaction(wallet2.publicAddress, wallet2.privateKey, wallet1.publicAddress, 3)
jCoin.createTransaction(wallet2.publicAddress, wallet2.privateKey, wallet1.publicAddress, 1)
// Add transactions to blockchain
console.log('Mining block 2...')
jCoin.addBlock()

// Create some transactions
jCoin.createTransaction(wallet2.publicAddress, wallet2.privateKey, wallet1.publicAddress, 1)

// Check if blockchain is valid
console.log('Is blockchain valid?', jCoin.isChainValid())

// Save current state of jcoin to json file
fs.writeFile('./data.json', JSON.stringify(jCoin, null, 2), function (err) {
  if (err) {
    console.log(err)
  }
  console.log('The file was saved!')
})
