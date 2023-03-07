const fs = require("fs")
import fetch = require("node-fetch")

import pet from "./pets"
import timer from "./timer"


type Stock = {buyPrice:  number, shares: number}

export type EconomyData = { money: number, stocks?: { [key: string]: Stock }, loanUsed?: number, lastLottery?: number, activePet?: string, lastWork?: number, sandCounter?: number }
let ECONOMY: { [key: string]: EconomyData } = {}

let lottery: { pool: number, numbers: [number, number, number] } = { pool: 0, numbers: [Math.floor(Math.random() * 5 + 1), Math.floor(Math.random() * 5 + 1), Math.floor(Math.random() * 5 + 1)] }


function setUserStockSymbol(id: string, symbol: string, data: {name: string, info: Stock}){
    if(!ECONOMY[id])
        return false
    if(!ECONOMY[id].stocks){
        ECONOMY[id].stocks = {}
    }
    //@ts-ignore
    ECONOMY[id].stocks[data.name] = data.info
    return true
}

function increaseSandCounter(id: string, amount  = 1){
    if(ECONOMY[id]?.sandCounter !== undefined){
        //@ts-ignore
        ECONOMY[id].sandCounter += amount
        return true
    }
    else if(ECONOMY[id]){
        ECONOMY[id].sandCounter = amount
    }
    return false
}

function getSandCounter(id: string){
    return ECONOMY[id]?.sandCounter
}

function userHasStockSymbol(id: string, symbol: string) {
    if (!symbol)
        return false
    let stocks = ECONOMY[id]?.stocks
    if (!stocks)
        return false
    let matches = Object.keys(stocks).filter(v => v.toLowerCase().replace(/\(.*/, "") == symbol.toLowerCase())
    if (matches.length > 0) {
        return { name: matches[0], info: stocks[matches[0]] }
    }
    return false
}

// function tradeItems(player1: string, item1: TradeType , player2: string, item2: TradeType){
//     if(!ECONOMY[player1] || !ECONOMY[player2]){
//         return false
//     }
//
//     let handleGivingTradeTypes = {
//         money: (player1: string, player2: string, data: number ) => {
//             if(typeof data === 'number'){
//                 loseMoneyToPlayer(player1,data, player2)
//                 return true
//             }
//             return false
//         },
//         stock: (player1: string, player2: string, data: {name: string, data: Stock} ) => {
//         }
//     }
//
//     let player1ItemType = item1.type
//     let player2ItemType = item2.type
// }

function loadEconomy() {
    if (fs.existsSync("./economy.json")) {
        let data = fs.readFileSync("./economy.json")
        ECONOMY = JSON.parse(data)
        if (ECONOMY['bank']) {
            delete ECONOMY['bank']
        }
    }
    if (fs.existsSync("./lottery.json")) {
        let data = fs.readFileSync("./lottery.json")
        lottery = JSON.parse(data)
    }
}
function saveEconomy() {
    fs.writeFileSync("./economy.json", JSON.stringify(ECONOMY))

    fs.writeFileSync("./lottery.json", JSON.stringify(lottery))
}

function buyLotteryTicket(id: string, cost: number) {
    const LOTTERY_DELAY = 60 * 5 //minutes
    //@ts-ignore
    if (ECONOMY[id].lastLottery && Date.now() / 1000 - ECONOMY[id].lastLottery < LOTTERY_DELAY) {
        return false
    }
    if (ECONOMY[id]) {
        ECONOMY[id].money -= cost
        ECONOMY[id].lastLottery = Date.now() / 1000
        lottery.pool += cost
        let ticket = [Math.floor(Math.random() * 5 + 1), Math.floor(Math.random() * 5 + 1), Math.floor(Math.random() * 5 + 1)]
        return ticket
    }
    return false
}

function newLottery() {
    lottery = { pool: 0, numbers: [Math.floor(Math.random() * 5 + 1), Math.floor(Math.random() * 5 + 1), Math.floor(Math.random() * 5 + 1)] }
}

function createPlayer(id: string, startingCash = 100) {
    timer.createTimer(id, "%can-earn")
    ECONOMY[id] = { money: startingCash, stocks: {} }
}

function addMoney(id: string, amount: number) {
    if (ECONOMY[id]) {
        ECONOMY[id].money += amount
        return true
    }
    return false
}

function loseMoneyToBank(id: string, amount: number) {
    if (ECONOMY[id]) {
        ECONOMY[id].money -= amount
    }
}

function loseMoneyToPlayer(id: string, amount: number, otherId: string) {
    if (ECONOMY[id]) {
        ECONOMY[id].money -= amount
    }
    if (ECONOMY[otherId] === undefined) {
        createPlayer(otherId, amount)
    }
    ECONOMY[otherId].money += amount
}

function earnMoney(id: string, percent = 1.001) {
    timer.restartTimer(id, "%can-earn")
    ECONOMY[id].money *= percent
}

function useLoan(id: string, amount: number) {
    ECONOMY[id].loanUsed = amount
}
function payLoan(id: string, amount: number) {
    if (!ECONOMY[id].money)
        return
    ECONOMY[id].money -= amount * 1.01
    if (ECONOMY[id].loanUsed) {
        //@ts-ignore
        ECONOMY[id].loanUsed -= amount
    }
    //@ts-ignore
    if (ECONOMY[id].loanUsed && ECONOMY[id].loanUsed <= 0) {
        delete ECONOMY[id].loanUsed
        return true
    }
    return false
}

function playerEconomyLooseTotal(id: string) {
    if (ECONOMY[id] === undefined)
        return 0
    let money = ECONOMY[id]?.money
    let stocks = ECONOMY[id].stocks
    if (stocks) {
        for (let stock in ECONOMY[id].stocks) {
            money += stocks[stock].buyPrice * stocks[stock].shares
        }
    }
    return money
}

function randInt(min: number, max: number) {
    return Math.random() * (max - min) + min
}

function taxPlayer(id: string, max: number, taxPercent: number | boolean = false) {
    timer.restartTimer(id, "%last-taxed")
    let total = playerEconomyLooseTotal(id)
    if(taxPercent === false){
        taxPercent = randInt(0.001, 0.008)
    }
    if (pet.getActivePet(id) == 'tiger') {
        taxPercent = pet.PETACTIONS['tiger']()
    }
    let amountTaxed = total * <number>taxPercent
    if (amountTaxed > max)
        amountTaxed = max
    ECONOMY[id].money -= amountTaxed
    return { amount: amountTaxed, percent: taxPercent as number }
}

function canWork(id: string){
    if(!ECONOMY[id]){
        return false
    }
    let secondsDiff = (Date.now() - (ECONOMY[id].lastWork || 0)) / 1000
    let total = playerEconomyLooseTotal(id)
    //not broke but it has been 1 hour
    if(total >= 0 && secondsDiff > 3600)
        return 0;
    if(total < 0 && secondsDiff > 3600){
        //broke and has been 1 hour
        return true
    }
    //not broke or has not been 1 hour
    return false
}

function playerLooseNetWorth(id: string){
    if(!ECONOMY[id])
        return 0
    return playerEconomyLooseTotal(id) - (ECONOMY[id]?.loanUsed || 0)
}

function economyLooseGrandTotal(){
    let moneyTotal = 0
    let stockTotal = 0
    let loanTotal = 0
    let econ = getEconomy()
    for(let player in econ){
        let pst = 0
        moneyTotal += econ[player].money
        for(let stock in econ[player].stocks){
            //@ts-ignore
            pst += econ[player].stocks[stock].shares * econ[player].stocks[stock].buyPrice
        }
        stockTotal += pst
        if(econ[player].loanUsed){
            //@ts-ignore
            loanTotal += econ[player].loanUsed
        }
    }
    return {money: moneyTotal, stocks: stockTotal, loan: loanTotal, total: moneyTotal + stockTotal - loanTotal, moneyAndStocks: moneyTotal + stockTotal}
}

function work(id: string){
    if(!ECONOMY[id])
        return false
    ECONOMY[id].lastWork = Date.now()
    let minimumWage = .001 * (economyLooseGrandTotal().total)
    if(addMoney(id, minimumWage)){
        return minimumWage
    }
    return false
}

function canTax(id: string, bonusTime?: number) {
    if (!ECONOMY[id])
        return false
    if (!timer.getTimer(id, "%last-taxed")) {
        timer.createTimer(id, "%last-taxed")
        return true
    }
    let total = playerEconomyLooseTotal(id)
    if (total === 0) {
        return false
    }
    return timer.has_x_s_passed(id, "%last-taxed", 900 + (bonusTime || 0))
}

function canBetAmount(id: string, amount: number) {
    if (ECONOMY[id] && amount <= ECONOMY[id].money) {
        return true
    }
    return false
}

function setMoney(id: string, amount: number) {
    if (ECONOMY[id]) {
        ECONOMY[id].money = amount
    }
    else {
        createPlayer(id)
        ECONOMY[id].money = amount
    }
}

function calculateAmountFromStringIncludingStocks(id: string, amount: string, extras?: { [key: string]: (total: number, k: string, data: EconomyData, match: RegExpMatchArray) => number }): number {
    if (ECONOMY[id] === undefined) {
        return NaN
    }
    let total = ECONOMY[id].money
    let stocks = ECONOMY[id].stocks
    if (stocks) {
        for (let stock in ECONOMY[id].stocks) {
            total += stocks[stock].buyPrice * stocks[stock].shares
        }
    }
    return calculateAmountOfMoneyFromString(id, total, amount, extras, calculateAmountFromStringIncludingStocks)
}

function calculateStockAmountFromString(id: string, shareCount: number, amount: string) {
    if (ECONOMY[id] === undefined) {
        return NaN
    }
    return calculateAmountOfMoneyFromString(id, shareCount, amount)
}

function calculateLoanAmountFromString(id: string, amount: string, extras?: { [key: string]: (total: number, k: string, data: EconomyData, match: RegExpMatchArray) => number }): number {
    let loanDebt = ECONOMY[id]?.loanUsed
    if (!loanDebt)
        return 0
    return calculateAmountOfMoneyFromString(id, loanDebt, amount, extras, calculateLoanAmountFromString)
}

function calculateAmountOfMoneyFromString(id: string, money: number, amount: string, extras?: { [key: string]: (total: number, k: string, data: EconomyData, match: RegExpMatchArray) => number }, fallbackFn?: (id: string, amount: string, extras?: { [key: string]: (total: number, k: string, data: EconomyData, match: RegExpMatchArray) => number}) => number ): number {
    if (amount == undefined || amount == null) {
        return NaN
    }
    if (amount === 'Infinity')
        return Infinity
    amount = amount.toLowerCase()
    let match //for else if(match =...)
    if (amount == "all") {
        return money * .99
    }
    else if (amount == "all!") {
        return money
    }
    else if (amount.startsWith('#')) {
        let toNextMultipleOf = Number(amount.slice(1))
        if (isNaN(toNextMultipleOf)) {
            return NaN
        }
        return toNextMultipleOf - (money % toNextMultipleOf)
    }
    else if(amount.endsWith("#")){
        let toNextMultipleOf = Number(amount.slice(0, -1))
        if(isNaN(toNextMultipleOf)){
            return NaN
        }
        return money % toNextMultipleOf
    }
    else if(amount.endsWith("k")){
        return Number(amount.slice(0, -1)) * 1000
    }
    else if(amount.endsWith("m")){
        return Number(amount.slice(0, -1)) * 1000000
    }
    else if(amount.endsWith("b")){
        return Number(amount.slice(0, -1)) * 1000000000
    }
    else if(amount.endsWith("t")){
        return Number(amount.slice(0, -1)) * 1000000000000
    }
    else if (amount.startsWith("needed(") && amount.endsWith(")")) {
        let wantedAmount = parseFloat(amount.slice("needed(".length))
        return wantedAmount - money
    }
    else if (amount.startsWith("ineeded(") && amount.endsWith(")")) {
        let wantedAmount = parseFloat(amount.slice("ineeded(".length))
        return money - wantedAmount
    }
    else if(match = amount.match(/^(\d{18}):([\d%\$\.]+)$/)){
        let id = match[1]
        let amount = match[2]
        if(fallbackFn){
            return fallbackFn(id, amount, extras)
        }
        return calculateAmountOfMoneyFromString(id, money, amount, extras, fallbackFn)
    }
    else if(match = amount.match(/^(.+)([\+\-\/\*]+)(.+)$/)){
        let side1 = match[1]
        let operator = match[2]
        let side2 = match[3]
        let amount1, amount2
        if(!fallbackFn){
            amount1 = calculateAmountOfMoneyFromString(id, money, side1, extras, fallbackFn)
            amount2 = calculateAmountOfMoneyFromString(id, money, side2, extras, fallbackFn)
        }
        else{
            amount1 = fallbackFn(id, side1, extras)
            amount2 = fallbackFn(id, side2, extras)
        }
        switch(operator){
            case "+": return amount1 + amount2
            case "-": return amount1 - amount2
            case "*": return amount1 * amount2
            case "/": return amount1 / amount2
        }
    }
    for (let e in extras) {
        let match;
        if (match = amount.match(e)) {
            return extras[e](money, amount, ECONOMY[id], match)
        }
    }
    if (Number(amount)) {
        return Number(amount)
    }
    else if (amount[0] === "$" && Number(amount.slice(1))) {
        return Number(amount.slice(1))
    }
    else if (amount[amount.length - 1] === "%") {
        let percent = Number(amount.slice(0, -1))
        if (!percent) {
            return 0
        }
        return money * percent / 100
    }
    return 0
}

function calculateAmountFromString(id: string, amount: string, extras?: { [key: string]: (total: number, k: string, data: EconomyData, match: RegExpMatchArray) => number }): number {
    if (ECONOMY[id] === undefined) {
        return NaN
    }
    return calculateAmountOfMoneyFromString(id, ECONOMY[id].money, amount, extras, calculateAmountFromString)
}

function resetEconomy() {
    ECONOMY = {}
    saveEconomy()
    loadEconomy()
}

function resetPlayer(id: string) {
    if (ECONOMY[id]) {
        delete ECONOMY[id]
    }
}

function sellStock(id: string, stock: string, shares: number, sellPrice: number) {
    if (ECONOMY[id].stocks?.[stock]) {
        //@ts-ignore
        ECONOMY[id].money += sellPrice * shares
        //@ts-ignore
        ECONOMY[id].stocks[stock].shares -= shares
        //@ts-ignore
        if (ECONOMY[id].stocks[stock].shares <= 0) {
            //@ts-ignore
            delete ECONOMY[id].stocks[stock]
        }
    }
}

function removeStock(id: string, stock: string) {
    if (ECONOMY[id].stocks?.[stock] !== undefined) {
        //@ts-ignore
        delete ECONOMY[id].stocks[stock]
    }
}

function giveStock(id: string, stock: string, buyPrice: number, shares: number) {
    if (ECONOMY[id].stocks) {
        //@ts-ignore
        ECONOMY[id].stocks[stock] = { buyPrice: buyPrice, shares: shares }
    }
    else {
        ECONOMY[id].stocks = {}
        //@ts-ignore
        ECONOMY[id].stocks[stock] = { buyPrice: buyPrice, shares: shares }
    }
}

function buyStock(id: string, stock: string, shares: number, cost: number) {
    if (!ECONOMY[id]) {
        return
    }
    if (!ECONOMY[id].stocks) {
        ECONOMY[id].stocks = {}
    }
    //@ts-ignore
    if (!ECONOMY[id].stocks[stock]) {
        //@ts-ignore
        ECONOMY[id].stocks[stock] = { buyPrice: cost, shares: shares }
    }
    else {
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

function _set_active_pet(id: string, pet: string) {
    ECONOMY[id].activePet = pet
}
function _get_active_pet(id: string) {
    return ECONOMY[id].activePet
}

function getEconomy() {
    return ECONOMY
}

function getLottery() {
    return lottery
}


async function getStockInformation(quote: string, cb?: (data: { change: number, price: number, "%change": string, volume: string, name: string } | false) => any, fail?: (err: any) => any): Promise<{ change: Number, price: number, "%change": string, volume: string, name: string } | false> {
    if (!quote)
        return false
    let data: { change: number, price: number, "%change": string, volume: string, name: string } = { change: 0, price: 0, "%change": "0%", volume: "0", name: quote.toUpperCase() }
    let html
    try{
        html = await (await fetch.default(`https://finance.yahoo.com/quote/${encodeURI(quote)}`)).text()
    }
    catch(err){
        if(fail)
            fail(err)
        return false
    }

    let stockData = html.matchAll(new RegExp(`data-symbol="${quote.toUpperCase().trim().replace("^", '.')}"([^>]+)>`, "g"))
    let jsonStockInfo: { [key: string]: string } = {}
    //sample: {"regularMarketPrice":"52.6","regularMarketChange":"-1.1000023","regularMarketChangePercent":"-0.020484215","regularMarketVolume":"459,223"}
    for (let stockInfo of stockData) {
        if (!stockInfo[1]) continue;
        let field = stockInfo[1].match(/data-field="([^"]+)"/)
        let value = stockInfo[1].match(/value="([^"]+)"/)
        if (!value || !field) continue
        jsonStockInfo[field[1]] = value[1]
    }
    if (Object.keys(jsonStockInfo).length < 1) {
        if (cb)
            cb(false)
        return false
    }
    let nChange = Number(jsonStockInfo["regularMarketChange"])
    let nPrice = Number(jsonStockInfo["regularMarketPrice"]) || 0
    data["change"] = nChange
    data["price"] = nPrice
    data["%change"] = jsonStockInfo["regularMarketChangePercent"]
    data["volume"] = jsonStockInfo["regularMarketVolume"]
    if (cb)
        cb(data)
    return data
}

export {
    loadEconomy,
    saveEconomy,
    createPlayer,
    earnMoney,
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
    calculateAmountFromStringIncludingStocks,
    sellStock,
    buyLotteryTicket,
    newLottery,
    removeStock,
    giveStock,
    resetPlayer,
    userHasStockSymbol,
    useLoan,
    payLoan,
    calculateLoanAmountFromString,
    _set_active_pet,
    _get_active_pet,
    getEconomy,
    getLottery,
    playerEconomyLooseTotal,
    getStockInformation,
    calculateAmountOfMoneyFromString,
    work,
    economyLooseGrandTotal,
    playerLooseNetWorth,
    canWork,
    setUserStockSymbol,
    increaseSandCounter,
    getSandCounter,
    // tradeItems
}
