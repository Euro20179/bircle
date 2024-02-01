import fs from 'fs'
import fetch = require("node-fetch")

import pet from "./pets"
import timer from "./timer"

import amount_parser from './amount-parser'
import { valuesOf } from "./util"


type Stock = { buyPrice: number, shares: number }

export type EconomyData = { retired?: boolean, money: number, stocks?: { [key: string]: Stock }, loanUsed?: number, lastLottery?: number, activePet?: string, sandCounter?: number }
let ECONOMY: { [key: string]: EconomyData } = {}

let lottery: { pool: number, numbers: [number, number, number] } = { pool: 0, numbers: [Math.floor(Math.random() * 5 + 1), Math.floor(Math.random() * 5 + 1), Math.floor(Math.random() * 5 + 1)] }

function isRetired(id: string) {
    return ECONOMY[id]?.retired
}

type BaseInterestOptions = {
    puffle_chat_count?: number,
    has_capitalism_hat?: boolean,
    has_cat?: boolean
}

function calculateBaseInterest(options: BaseInterestOptions) {
    let percent = 1.001 + (0.0001 * (options.puffle_chat_count || 0))
    if (options.has_capitalism_hat) {
        percent += 0.002
    }
    if (options.has_cat) {
        percent += 0.001
    }
    return percent
}

type CalculateTaxPercentOptions = {
    max: number,
    taxPercent?: number | false
    taxerIsRetired?: boolean,
    hasTiger?: boolean
}
function calculateTaxPercent(id: string, { max, taxPercent, taxerIsRetired, hasTiger }: CalculateTaxPercentOptions) {
    let total = playerEconomyLooseTotal(id)
    taxerIsRetired ??= false
    if (taxPercent ?? false === false) {
        if (taxerIsRetired) {
            taxPercent = randInt(0.01, 0.02)
        } else taxPercent = randInt(0.001, 0.008)
    }
    if (hasTiger) {
        taxPercent = randInt(-0.003, 0.006)
    }
    let amountTaxed = Math.min(total * (taxPercent || 0.001), max)
    return amountTaxed
}

function setUserStockSymbol(id: string, data: { name: string, info: Stock }) {
    let userEconData = ECONOMY[id]
    if (!userEconData)
        return false
    if (!userEconData.stocks) {
        userEconData.stocks = {}
    }
    userEconData.stocks[data.name] = data.info
    return true
}

function increaseSandCounter(id: string, amount: int_t = 1) {
    let userEconData = ECONOMY[id]
    if (userEconData?.sandCounter !== undefined) {
        userEconData.sandCounter += amount
        return true
    }
    else if (ECONOMY[id]) {
        ECONOMY[id].sandCounter = amount
    }
    return false
}

function getSandCounter(id: string) {
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
    if (fs.existsSync("./database/economy.json")) {
        let data = fs.readFileSync("./database/economy.json", 'utf-8')
        ECONOMY = JSON.parse(data)
        if (ECONOMY['bank']) {
            delete ECONOMY['bank']
        }
    }
    if (fs.existsSync("./database/lottery.json")) {
        let data = fs.readFileSync("./database/lottery.json", 'utf-8')
        lottery = JSON.parse(data)
    }
}
function saveEconomy() {
    fs.writeFileSync("./database/economy.json", JSON.stringify(ECONOMY))

    fs.writeFileSync("./database/lottery.json", JSON.stringify(lottery))
}

function buyLotteryTicket(id: string, cost: number) {
    const LOTTERY_DELAY = 60 * 5 //minutes
    let userEconData = ECONOMY[id]
    if (userEconData.lastLottery && Date.now() / 1000 - userEconData.lastLottery < LOTTERY_DELAY) {
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
    ECONOMY[id] = { money: startingCash, stocks: {}, retired: false }
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
    let userEconData = ECONOMY[id]
    if (userEconData.loanUsed) {
        userEconData.loanUsed -= amount
    }
    if (userEconData.loanUsed && userEconData.loanUsed <= 0) {
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

function taxPlayer(id: string, max: number, taxPercent: number | boolean = false, taxerIsRetired = false) {
    timer.restartTimer(id, "%last-taxed")
    let amountTaxed = calculateTaxPercent(id, {
        max,
        taxPercent: taxPercent as number | false,
        taxerIsRetired,
        hasTiger: pet.getActivePet(id) === 'tiger'
    })
    ECONOMY[id].money -= amountTaxed
    return { amount: amountTaxed, percent: taxPercent as number }
}

function canWork(id: string) {
    if (!ECONOMY[id]) {
        return false
    }
    const enoughTimeHasPassed = timer.has_x_m_passed(id, "%work", 60, true)
    let total = playerEconomyLooseTotal(id)
    //not broke but it has been 1 hour
    if (total >= 0 && enoughTimeHasPassed)
        return 0;
    if (total < 0 && enoughTimeHasPassed) {
        //broke and has been 1 hour
        return true
    }
    //not broke or has not been 1 hour
    return false
}

function playerLooseNetWorth(id: string) {
    if (!ECONOMY[id])
        return 0
    return playerEconomyLooseTotal(id) - (ECONOMY[id]?.loanUsed || 0)
}

function economyLooseGrandTotal(countNegative = true) {
    let moneyTotal = 0,
        stockTotal = 0,
        loanTotal = 0
    for (const [player, data] of Object.entries(ECONOMY)) {
        let nw = playerLooseNetWorth(player)
        if (nw < 0 && !countNegative) continue;

        moneyTotal += data.money

        if (data.stocks) {
            for (const stockData of valuesOf(data.stocks))
                stockTotal += stockData.shares * stockData.buyPrice
        }

        loanTotal += data.loanUsed ?? 0
    }
    return { money: moneyTotal, stocks: stockTotal, loan: loanTotal, total: moneyTotal + stockTotal - loanTotal, moneyAndStocks: moneyTotal + stockTotal }
}

function work(id: string) {
    if (!ECONOMY[id])
        return false
    timer.createOrRestartTimer(id, "%work")
    let economyTotal = economyLooseGrandTotal().total
    let minimumWage = (.01 * (economyLooseGrandTotal()).total) * (1 - (playerLooseNetWorth(id) / economyTotal))
    if (addMoney(id, minimumWage)) {
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
    if (isNaN(amount) || amount < 0) {
        return false
    }
    if (ECONOMY[id] && amount <= ECONOMY[id].money) {
        return true
    }
    return false
}

function setMoney(id: string, amount: number) {
    if (!ECONOMY[id]) {
        createPlayer(id)
    }
    ECONOMY[id].money = amount
}

function calculateAmountFromNetWorth(id: string, amount: string, extras?: { [key: string]: (total: number, k: string) => number }): number {
    if (ECONOMY[id] === undefined) {
        return NaN
    }

    let total = playerLooseNetWorth(id)

    return amount_parser.calculateAmountRelativeTo(total, amount, extras)
}

function calculateAmountFromStringIncludingStocks(id: string, amount: string, extras?: { [key: string]: (total: number, k: string) => number }): number {
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
    return amount_parser.calculateAmountRelativeTo(total, amount, extras)
}

function calculateStockAmountFromString(id: string, shareCount: number, amount: string) {
    if (ECONOMY[id] === undefined) {
        return NaN
    }
    return amount_parser.calculateAmountRelativeTo(shareCount, amount)
}

function calculateLoanAmountFromString(id: string, amount: string, extras?: { [key: string]: (total: number, k: string) => number }): number {
    let loanDebt = ECONOMY[id]?.loanUsed
    if (!loanDebt)
        return 0
    return amount_parser.calculateAmountRelativeTo(loanDebt, amount, extras)
}


function calculateAmountFromString(id: string, amount: string, extras?: { [key: string]: (total: number, k: string) => number }): number {
    if (ECONOMY[id] === undefined) {
        return NaN
    }
    return amount_parser.calculateAmountRelativeTo(ECONOMY[id].money, amount, extras)
}

function resetEconomy() {
    ECONOMY = {}
    saveEconomy()
    loadEconomy()
}

function retirePlayer(id: string) {
    if (!ECONOMY[id]) {
        return false
    }
    return ECONOMY[id].retired = true
}

function resetPlayer(id: string) {
    if (ECONOMY[id]) {
        delete ECONOMY[id]
    }
}

function sellStock(id: string, stock: string, shares: number, sellPrice: number) {
    let playerData = ECONOMY[id]
    if (playerData.stocks?.[stock]) {
        playerData.money += sellPrice * shares
        playerData.stocks[stock].shares -= shares
        if (playerData.stocks[stock].shares <= 0) {
            delete playerData.stocks[stock]
        }
    }
}

function removeStock(id: string, stock: string) {
    let playerData = ECONOMY[id]
    if (playerData.stocks?.[stock] !== undefined) {
        delete playerData.stocks[stock]
    }
}

function giveStock(id: string, stock: string, buyPrice: number, shares: number) {
    let playerData = ECONOMY[id]
    if (playerData.stocks) {
        playerData.stocks[stock] = { buyPrice: buyPrice, shares: shares }
    }
    else {
        playerData.stocks = {}
        playerData.stocks[stock] = { buyPrice: buyPrice, shares: shares }
    }
}

function buyStock(id: string, stock: string, shares: number, cost: number) {
    if (!ECONOMY[id]) {
        return
    }
    let playerData = ECONOMY[id]
    if (!playerData.stocks) {
        playerData.stocks = {}
    }
    if (!playerData.stocks[stock]) {
        playerData.stocks[stock] = { buyPrice: cost, shares: shares }
    }
    else {
        let oldShareCount = playerData.stocks[stock].shares
        let oldBuyPriceWeight = playerData.stocks[stock].buyPrice * (oldShareCount / (oldShareCount + shares))
        let newBuyPriceWeight = cost * (shares / (oldShareCount + shares))
        playerData.stocks[stock].shares += shares
        playerData.stocks[stock].buyPrice = oldBuyPriceWeight + newBuyPriceWeight
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
    try {
        html = await (await fetch.default(`https://finance.yahoo.com/quote/${encodeURI(quote)}`)).text()
    }
    catch (err) {
        if (fail)
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
    if (!Object.hasEnumerableKeys(jsonStockInfo)) {
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

let lastEconomyTotal = economyLooseGrandTotal().total
let inflation = 0
setInterval(() => {
    inflation = (economyLooseGrandTotal().total - lastEconomyTotal) / lastEconomyTotal
    lastEconomyTotal = economyLooseGrandTotal().total
}, 60000)

export default {
    getInflation: () => inflation,
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
    calculateAmountFromNetWorth,
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
    work,
    economyLooseGrandTotal,
    playerLooseNetWorth,
    canWork,
    setUserStockSymbol,
    increaseSandCounter,
    getSandCounter,
    isRetired,
    retirePlayer,
    randInt,
    calculateBaseInterest,
    calculateTaxPercent
    // tradeItems
}
