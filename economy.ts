const fs = require("fs")

type EconomyData = {money: number, lastTalk: number, lastTaxed?: number, stocks?: {[key: string]: {buyPrice: number, shares: number}}}
let ECONOMY: {[key: string]: EconomyData} = {}

function loadEconomy(){
    if(fs.existsSync("./economy.json")){
        let data = fs.readFileSync("./economy.json")
        ECONOMY = JSON.parse(data)
        if(ECONOMY['bank']){
            delete ECONOMY['bank']
        }
    }
}
function saveEconomy(){
    fs.writeFileSync("./economy.json", JSON.stringify(ECONOMY))
}

function createPlayer(id: string){
    ECONOMY[id] = {money: 100, lastTalk: 0, lastTaxed: 0, stocks: {}}
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
        createPlayer(otherId)
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

function calculateAmountFromString(id: string, amount: string){
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

function reset(){
    ECONOMY = {}
    saveEconomy()
    loadEconomy()
}

function sellStock(id: string, stock: string, shares: number){
    if(ECONOMY[id].stocks?.[stock]){
        //@ts-ignore
        ECONOMY[id].stocks[stock].shares -= shares
        //@ts-ignore
        if(ECONOMY[id].stocks[stock].shares <= 0){
            //@ts-ignore
            delete ECONOMY[id].stocks[stock]
        }
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
    loadEconomy: loadEconomy,
    saveEconomy: saveEconomy,
    createPlayer: createPlayer,
    earnMoney: earnMoney,
    canEarn: canEarn,
    addMoney: addMoney,
    canBetAmount: canBetAmount,
    canTax: canTax,
    taxPlayer: taxPlayer,
    loseMoneyToBank: loseMoneyToBank,
    calculateAmountFromString: calculateAmountFromString,
    loseMoneyToPlayer: loseMoneyToPlayer,
    setMoney: setMoney,
    resetEconomy: reset,
    buyStock: buyStock,
    calculateStockAmountFromString: calculateStockAmountFromString,
    sellStock: sellStock
}
