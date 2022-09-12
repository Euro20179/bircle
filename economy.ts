const fs = require("fs")

type EconomyData = {money: number, lastTalk: number, lastTaxed?: number, stocks?: {[key: string]: {buyPrice: number, shares: number}}}
let ECONOMY: {[key: string]: EconomyData} = {}

let lottery: {pool: number, numbers: [number, number, number]} = {pool: 0, numbers: [Math.floor(Math.random() * 5 + 1), Math.floor(Math.random() * 5 + 1), Math.floor(Math.random() * 5 + 1)]}


function loadEconomy(){
    if(fs.existsSync("./economy.json")){
        let data = fs.readFileSync("./economy.json")
        ECONOMY = JSON.parse(data)
        if(ECONOMY['bank']){
            delete ECONOMY['bank']
        }
    }
    if(fs.existsSync("./lottery.json")){
        let data = fs.readFileSync("./lottery.json")
        lottery = JSON.parse(data)
    }
}
function saveEconomy(){
    fs.writeFileSync("./economy.json", JSON.stringify(ECONOMY))
    fs.writeFileSync("./lottery.json", JSON.stringify(lottery))
}

function buyLotteryTicket(id: string, cost: number){
    if(ECONOMY[id]){
        ECONOMY[id].money -= cost
        lottery.pool += cost
        let ticket = [Math.floor(Math.random() * 5 + 1), Math.floor(Math.random() * 5 + 1), Math.floor(Math.random() * 5 + 1)]
        return ticket
    }
    return false
}

function newLottery(){
    lottery = {pool: 0, numbers: [Math.floor(Math.random() * 5 + 1), Math.floor(Math.random() * 5 + 1), Math.floor(Math.random() * 5 + 1)]}
}

function createPlayer(id: string, startingCash = 100){
    ECONOMY[id] = {money: startingCash, lastTalk: 0, lastTaxed: 0, stocks: {}}
}

function addMoney(id: string, amount: number){
    if(ECONOMY[id]){
        ECONOMY[id].money += amount
    }
}

function loseMoneyToBank(id: string, amount: number){
    if(ECONOMY[id]){
        ECONOMY[id].money -= amount
    }
}

function loseMoneyToPlayer(id: string, amount: number, otherId: string){
    if(ECONOMY[id]){
        ECONOMY[id].money -= amount
    }
    if(ECONOMY[otherId] === undefined){
        createPlayer(otherId, amount)
    }
    ECONOMY[otherId].money += amount
}

function earnMoney(id: string){
    ECONOMY[id].lastTalk = Date.now()
    ECONOMY[id].money *= 1.001
}

function taxPlayer(id: string){
    ECONOMY[id].lastTaxed = Date.now()
    let taxPercent = (Math.random() * (.99 - .97) + .97)
    let amountTaxed = ECONOMY[id].money - (ECONOMY[id].money * taxPercent)
    ECONOMY[id].money *= taxPercent
    return {amount: amountTaxed, percent: 1 - taxPercent}
}

function canEarn(id: string){
    if(!ECONOMY[id])
        return false
    let secondsDiff = (Date.now() - ECONOMY[id].lastTalk) / 1000
    if(secondsDiff > 60){
        return true
    }
    return false
}

function canTax(id: string){
    if(!ECONOMY[id])
        return false
    if(!ECONOMY[id].lastTaxed){
        ECONOMY[id].lastTaxed = 0
        return true
    }
    if(ECONOMY[id].money === 0){
        return false
    }
    //@ts-ignore
    let secondsDiff = (Date.now() - ECONOMY[id].lastTaxed) / 1000
    //5 minutes
    if(secondsDiff > 900){
        return true
    }
    return false
}

function canBetAmount(id: string, amount: number){
    if(ECONOMY[id] && amount <= ECONOMY[id].money){
        return true
    }
    return false
}

function setMoney(id: string, amount: number){
    if(ECONOMY[id]){
        ECONOMY[id].money = amount
    }
    else{
        createPlayer(id)
        ECONOMY[id].money = amount
    }
}

function calculateStockAmountFromString(id: string, shareCount: number, amount: string){
    if(amount == undefined || amount == null){
        return NaN
    }
    if(ECONOMY[id] === undefined){
        return NaN
    }
    amount = amount.toLowerCase()
    if(amount == "all"){
        return shareCount
    }

    if(Number(amount)){
        return Number(amount)
    }
    else if(amount[0] === "$" && Number(amount.slice(1))){
        return Number(amount.slice(1))
    }
    else if(amount[amount.length - 1] === "%"){
        let percent = Number(amount.slice(0, -1))
        if(!percent){
            return 0
        }
        return shareCount * percent / 100
    }
    return 0
}

function calculateAmountFromString(id: string, amount: string, extras: {[key: string]: (total: number, k: string) => number}){
    if(amount == undefined || amount == null){
        return NaN
    }
    if(ECONOMY[id] === undefined){
        return NaN
    }
    amount = amount.toLowerCase()
    if(amount == "all"){
        return ECONOMY[id].money * .99
    }
    if(amount == "all!"){
        return ECONOMY[id].money
    }
    for(let e in extras){
        if (amount.match(e)){
            return extras[e](ECONOMY[id].money, amount)
        }
    }
    if(Number(amount)){
        return Number(amount)
    }
    else if(amount[0] === "$" && Number(amount.slice(1))){
        return Number(amount.slice(1))
    }
    else if(amount[amount.length - 1] === "%"){
        let percent = Number(amount.slice(0, -1))
        if(!percent){
            return 0
        }
        let money = ECONOMY[id].money
        return money * percent / 100
    }
    return 0
}

function resetEconomy(){
    ECONOMY = {}
    saveEconomy()
    loadEconomy()
}

function sellStock(id: string, stock: string, shares: number, sellPrice: number){
    if(ECONOMY[id].stocks?.[stock]){
        //@ts-ignore
        ECONOMY[id].money += sellPrice * shares
        //@ts-ignore
        ECONOMY[id].stocks[stock].shares -= shares
        //@ts-ignore
        if(ECONOMY[id].stocks[stock].shares <= 0){
            //@ts-ignore
            delete ECONOMY[id].stocks[stock]
        }
    }
}

function removeStock(id: string, stock: string){
    if(ECONOMY[id].stocks?.[stock]){
        delete ECONOMY[id].stocks[stock]
    }
}

function giveStock(id: string, stock: string, buyPrice: number, shares: number){
    if(ECONOMY[id].stocks){
        ECONOMY[id].stocks[stock] = {buyPrice: buyPrice, shares: shares}
    }
    else{
        ECONOMY[id].stocks = {}
        ECONOMY[id].stocks[stock] = {buyPrice: buyPrice, shares: shares}
    }
}

function buyStock(id: string, stock: string, shares: number, cost: number){
    if(!ECONOMY[id]){
        return
    }
    if(!ECONOMY[id].stocks){
        ECONOMY[id].stocks = {}
    }
    //@ts-ignore
    if(!ECONOMY[id].stocks[stock]){
        //@ts-ignore
        ECONOMY[id].stocks[stock] = {buyPrice: cost, shares: shares}
    }
    else{
        //@ts-ignore
        let oldShareCount = ECONOMY[id].stocks[stock].shares
        //@ts-ignore
        let oldBuyPriceWeight = ECONOMY[id].stocks[stock].buyPrice * (oldShareCount / (oldShareCount + shares))
        let newBuyPriceWeight = cost * (shares / (oldShareCount + shares))
        //@ts-ignore
        ECONOMY[id].stocks[stock].shares += shares
        //@ts-ignore
        ECONOMY[id].stocks[stock].buyPrice = oldBuyPriceWeight + newBuyPriceWeight
    }
    loseMoneyToBank(id, cost * shares)
}

loadEconomy()


module.exports = {
    ECONOMY: () => ECONOMY,
    LOTTERY: () => lottery,
    loadEconomy,
    saveEconomy,
    createPlayer,
    earnMoney,
    canEarn,
    addMoney,
    canBetAmount,
    canTax,
    taxPlayer,
    loseMoneyToBank,
    calculateAmountFromString,
    loseMoneyToPlayer,
    setMoney,
    resetEconomy,
    buyStock,
    calculateStockAmountFromString,
    sellStock,
    buyLotteryTicket,
    newLottery,
    removeStock,
    giveStock,
}
