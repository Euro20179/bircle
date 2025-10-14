import fs from 'fs'

import pet from "./pets"
import timer from "./timer"

import amount_parser from './amount-parser'
import { randInt, valuesOf } from "./util"
import { getConfigValue } from './config-manager'

import { Database } from "bun:sqlite"

let db = new Database("./database/economy.db")

db.exec("CREATE TABLE IF NOT EXISTS points (id TEXT, count NUMBER)")
db.exec("CREATE TABLE IF NOT EXISTS economy (id TEXT, money NUMBER, loanUsed NUMBER, activePet TEXT, sandCounter INTEGER, retired BOOLEAN)")
db.exec("CREATE TABLE IF NOT EXISTS stocks (id TEXT, ticker STRING, purchasePrice NUMBER, shares INTEGER)")
db.exec("CREATE TABLE IF NOT EXISTS lottery (pool NUMBER, n1 INTEGER, n2 INTEGER, n3 INTEGER)")
if (getLottery() === null) {
    db.exec("INSERT INTO lottery (pool, n1, n2, n3) VALUES (0, 0, 0, 0)")
    newLottery()
}

type Stock = { buyPrice: number, shares: number }

export type EconomyData = { retired?: boolean, money: number, stocks?: { [key: string]: Stock }, loanUsed?: number, lastLottery?: number, activePet?: string, sandCounter?: number }
let ECONOMY: { [key: string]: EconomyData } = {}

let lottery: { pool: number, numbers: [number, number, number] } = { pool: 0, numbers: [Math.floor(Math.random() * 5 + 1), Math.floor(Math.random() * 5 + 1), Math.floor(Math.random() * 5 + 1)] }

function givePoint(id: string) {
    const stmnt = db.query("UPDATE points SET count = count + 1 WHERE id = ?")
    stmnt.run(id)
}

function getPoints(id: string) {
    const stmnt = db.prepare("SELECT count FROM points WHERE id == ?")
    const res = stmnt.get(id)
    console.log(res)
    return res["count"]
}

function playerCount() {
    const results = db.query("SELECT id FROM economy").all()
    return results.length
}

function playerExists(id: string) {
    const stmnt = db.query(`SELECT money FROM economy WHERE id == ?`)
    return stmnt.get(id) !== null
}

function playerGetInfo<T>(id: string, wanted: "money" | "loanUsed" | "activePet" | "sandCounter" | "retired"): T {
    const stmnt = db.query(`SELECT ${wanted} FROM economy WHERE id == ?`)
    return stmnt.get(id) as T
}

//@ts-ignore
const getMoney = (id: string) => playerGetInfo<number>(id, "money")["money"]
//@ts-ignore
const getLoan = (id: string) => playerGetInfo<number>(id, "loanUsed")["loanUsed"]

type StockInfo = { ticker: string, purchasePrice: number, shares: number, rowid: number }
function getStocks(id: string): { [ticker: string]: { purchasePrice: number, shares: number, id: number }[] } {
    const stmnt = db.query(`SELECT rowid, ticker, purchasePrice, shares FROM stocks WHERE id = ?`)
    const results = stmnt.all(id) as StockInfo[]
    const stocks: { [ticker: string]: { purchasePrice: number, shares: number, id: number }[] } = {}
    let empty = true
    for (let res of results) {
        empty = false
        const ticker = res["ticker"]
        if (stocks[ticker]) {
            stocks[ticker].push({ purchasePrice: res["purchasePrice"], shares: res["shares"], id: res["rowid"] })
        } else {
            stocks[ticker] = [{ purchasePrice: res["purchasePrice"], shares: res["shares"], id: res['rowid'] }]
        }
    }
    return stocks
}

function isRetired(id: string) {
    const stmnt = db.query(`SELECT retired FROM economy WHERE id == ?`)
    const res = stmnt.get(id)
    return res["retired"]
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
    if ((taxPercent ?? false) === false) {
        if (taxerIsRetired) {
            taxPercent = randInt(0.01, 0.02)
        } else taxPercent = randInt(0.001, 0.008)
    }
    if (hasTiger) {
        taxPercent = randInt(-0.003, 0.006)
    }
    let amountTaxed = Math.min(total * (taxPercent || 0.001), max)
    return { amountTaxed, taxPercent }
}

function setUserStockSymbol(id: string, data: { name: string, info: Stock }) {
    return false
    // let userEconData = ECONOMY[id]
    // if (!userEconData)
    //     return false
    // if (!userEconData.stocks) {
    //     userEconData.stocks = {}
    // }
    // userEconData.stocks[data.name] = data.info
    // return true
}

function increaseSandCounter(id: string, amount: int_t = 1) {
    const stmnt = db.query("UPDATE economy SET sandCounter = sandCounter + ? WHERE id = ?")
    stmnt.run(amount, id)
    return true
}

function getSandCounter(id: string) {
    const stmnt = db.query("SELECT sandCounter FROM economy WHERE id = ?")
    const res = stmnt.get(id)
    return res["sandCounter"];
}

function userHasStockSymbol(id: string, symbol: string) {
    if (!symbol)
        return false
    const stocks = getStocks(id)
    if (!stocks)
        return false
    symbol = symbol.toUpperCase()
    return stocks[symbol] ? { name: symbol, info: stocks[symbol] } : false
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
    // if (fs.existsSync("./database/economy.json")) {
    //     let data = fs.readFileSync("./database/economy.json", 'utf-8')
    //     ECONOMY = JSON.parse(data)
    //     if (ECONOMY['bank']) {
    //         delete ECONOMY['bank']
    //     }
    // }
    // if (fs.existsSync("./database/lottery.json")) {
    //     let data = fs.readFileSync("./database/lottery.json", 'utf-8')
    //     lottery = JSON.parse(data)
    // }
}

function saveEconomy() {
    // fs.writeFileSync("./database/economy.json", JSON.stringify(ECONOMY))
    //
    // fs.writeFileSync("./database/lottery.json", JSON.stringify(lottery))
}

function increaseLotteryPool(amount: number) {
    db.run(`UPDATE lottery SET pool = pool + ?`, [amount])
}

function buyLotteryTicket(id: string, cost: number) {
    if ((!timer.has_x_m_passed(id, "%lastLottery", 5, true) || !playerExists(id))) {
        return false
    }
    timer.createOrRestartTimer(id, "%lastLottery")
    loseMoneyToBank(id, cost)
    increaseLotteryPool(cost)

    let ticket = [Math.floor(Math.random() * 5 + 1), Math.floor(Math.random() * 5 + 1), Math.floor(Math.random() * 5 + 1)]
    return ticket
}

function newLottery() {
    db.run(`UPDATE lottery SET pool = 0, n1 = ?, n2 = ?, n3 = ?`, [
        Math.floor(Math.random() * 5 + 1),
        Math.floor(Math.random() * 5 + 1),
        Math.floor(Math.random() * 5 + 1)
    ])
}

function createPlayer(id: string, startingCash = 0) {
    timer.createTimer(id, "%can-earn")
    const stmnt = db.query(` INSERT INTO economy (id, money, loanUsed, activePet, sandCounter, retired) VALUES (?, ?, 0, '', 0, false); `)
    const player = db.query(`SELECT count FROM points WHERE id = ?`)
    const res = player.get(id)
    if(res === null) {
        db.run("INSERT INTO points (id, count) VALUES (?, 0)", [id])
    }
    stmnt.run(id, startingCash)
}

function addMoney(id: string, amount: number) {
    const points = getPoints(id)
    if(points) {
        amount *= (1 + (.03 * points))
    }
    db.run(`UPDATE economy SET money = money + ? WHERE id = ?`, [amount, id])
    return true
}

function loseMoneyToBank(id: string, amount: number, increaseLottery /*certain things like buying stocks should not increase the lottery, because the player doesn't lose money*/ = true) {
    const percentageToGiveToLottery = 1/3
    if(increaseLottery)
        increaseLotteryPool(amount / (2 / percentageToGiveToLottery)) //we divide by 2, because the pool gets doubled on win
    db.run(`UPDATE economy SET money = money - ? WHERE id = ?`, [amount, id])
}

function loseMoneyToPlayer(id: string, amount: number, otherId: string) {
    if (!playerExists(otherId)) {
        createPlayer(otherId, 100)
    }
    db.run(`UPDATE economy SET money = money - ? WHERE id = ?`, [amount, id])
    db.run(`UPDATE economy SET money = money + ? WHERE id = ?`, [amount, otherId])
    return true
}

function earnMoney(id: string, percent = 1.001) {
    timer.restartTimer(id, "%can-earn")
    db.run(`UPDATE economy SET money = money * ? WHERE id = ?`, [percent, id])
}

function useLoan(id: string, amount: number) {
    db.run(`UPDATE economy SET loanUsed = loanUsed + ? WHERE id = ?`, [amount, id])
}
function payLoan(id: string, amount: number) {
    if (!getMoney(id)) {
        return
    }
    loseMoneyToBank(id, (amount * 1.01))
    useLoan(id, -amount)

    const loanUsed = getLoan(id)
    if (loanUsed <= 0) {
        db.run(`UPDATE economy SET loanUsed = 0 WHERE id = ?`, [id])
        return true
    }
    return false
}

function playerEconomyLooseTotal(id: string) {
    if (!playerExists(id))
        return 0

    let money = getMoney(id)
    const stocks = getStocks(id)

    for (let stock in stocks) {
        const lots = stocks[stock]
        for (let lot of lots) {
            money += lot.purchasePrice * lot.shares
        }
    }
    return money
}

function taxPlayer(id: string, max: number, taxPercent: number | boolean = false, taxerIsRetired = false) {
    timer.restartTimer(id, "%last-taxed")
    let amountTaxed = calculateTaxPercent(id, {
        max,
        taxPercent: taxPercent as number || false,
        taxerIsRetired,
        hasTiger: pet.getActivePet(id) === 'tiger'
    })
    loseMoneyToBank(id, amountTaxed.amountTaxed)
    return { amount: amountTaxed.amountTaxed, percent: amountTaxed.taxPercent}
}

function canWork(id: string) {
    if (!playerExists(id)) {
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
    if (!playerExists(id))
        return 0
    return playerEconomyLooseTotal(id) - (getLoan(id) || 0)
}

function economyLooseGrandTotal(countNegative = true) {
    let moneyTotal = 0,
        stockTotal = 0,
        loanTotal = 0
    const econ = db.query(`SELECT * FROM economy`).iterate()
    const stocks = db.query(`SELECT * FROM stocks`).all()
    for (let res of econ) {
        //@ts-ignore
        let nw = playerLooseNetWorth(res["id"])
        if (nw < 0 && !countNegative) continue;

        //@ts-ignore
        moneyTotal += res["money"]
        for (let stock of stocks) {
            //@ts-ignore
            if (stock["id"] !== res["id"]) continue;
            //@ts-ignore
            stockTotal += stock["shares"] * stock["purchasePrice"]
        }

        //@ts-ignore
        loanTotal += res["loanUsed"] ?? 0
    }
    return { money: moneyTotal, stocks: stockTotal, loan: loanTotal, total: moneyTotal + stockTotal - loanTotal, moneyAndStocks: moneyTotal + stockTotal }
}

function work(id: string) {
    if (!playerExists(id))
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
    if (!playerExists(id))
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
    if (playerExists(id) && amount <= getMoney(id)) {
        return true
    }
    return false
}

function setMoney(id: string, amount: number) {
    if (!playerExists(id)) {
        createPlayer(id)
    }
    db.run(`UPDATE economy SET money = ? WHERE id = ?`, [amount, id])
}

function calculateAmountFromNetWorth(id: string, amount: string, extras?: { [key: string]: (total: number, k: string) => number }): number {
    if (!playerExists(id)) {
        return NaN
    }

    let total = playerLooseNetWorth(id)

    return amount_parser.calculateAmountRelativeTo(total, amount, extras)
}

function calculateAmountFromStringIncludingStocks(id: string, amount: string, extras?: { [key: string]: (total: number, k: string) => number }): number {
    if (!playerExists(id)) {
        return NaN
    }
    let total = getMoney(id)
    let stocks = getStocks(id)
    for (let stock in stocks) {
        for (let lot of stocks[stock]) {
            total += lot.shares * lot.purchasePrice
        }
    }
    return amount_parser.calculateAmountRelativeTo(total, amount, extras)
}

function calculateStockAmountFromString(id: string, shareCount: number, amount: string) {
    if (!playerExists(id)) {
        return NaN
    }
    return amount_parser.calculateAmountRelativeTo(shareCount, amount)
}

function calculateLoanAmountFromString(id: string, amount: string, extras?: { [key: string]: (total: number, k: string) => number }): number {
    let loanDebt = getLoan(id)
    if (!loanDebt)
        return 0
    return amount_parser.calculateAmountRelativeTo(loanDebt, amount, extras)
}


function calculateAmountFromString(id: string, amount: string, extras?: { [key: string]: (total: number, k: string) => number }): number {
    if (!playerExists(id)) {
        return NaN
    }
    return amount_parser.calculateAmountRelativeTo(getMoney(id), amount, extras)
}

function resetEconomy() {
    db.close()
    fs.cpSync("./database/economy.db", "./database/economy-old.db")
    db = new Database("./database/economy.db")
    //yes this is correct
    db.run(`DELETE FROM economy`)
    db.run(`DELETE FROM stocks`)
}

function retirePlayer(id: string) {
    if (!playerExists(id)) {
        return false
    }
    db.run(`UPDATE economy SET retired = true WHERE id = ?`, [id])
}

function resetPlayer(id: string) {
    if (playerExists(id)) {
        db.run(`DELETE FROM economy WHERE id = ?`, [id])
        db.run(`DELETE FROM stocks WHERE id = ?`, [id])
    }
}

function sellStock(id: string, userStock: string, shares: number, sellPrice: number) {
    const stocks = getStocks(id)
    let amountSold = 0
    userStock = userStock.toUpperCase()
    let profit = 0
    for (let stock in stocks) {
        if (stock !== userStock) continue
        for (let lot of stocks[stock]) {
            let remaining = lot.shares - shares

            //we can't sell more than lot.shares
            let sellAmount = Math.min(lot.shares - remaining, lot.shares)
            profit += (sellPrice - lot.purchasePrice) * sellAmount
            if (remaining <= 0) {
                amountSold += lot.shares
                db.run(`DELETE FROM stocks WHERE id = ? AND rowid = ?`, [id, lot.id])
                addMoney(id, sellPrice)
            } else {
                //if we have shares left over, we've sold all the required shares
                amountSold += sellAmount
                db.run(`UPDATE stocks SET shares = ? WHERE rowid = ?`, [remaining, lot.id])
                break
            }
        }
        if (amountSold === shares) {
            break;
        }
    }
    return {
        profit
    }
}

function removeStock(id: string, stock: string) {
    // let playerData = ECONOMY[id]
    // if (playerData.stocks?.[stock] !== undefined) {
    //     delete playerData.stocks[stock]
    // }
}

function giveStock(id: string, stock: string, buyPrice: number, shares: number) {
    // let playerData = ECONOMY[id]
    // if (playerData.stocks) {
    //     playerData.stocks[stock] = { buyPrice: buyPrice, shares: shares }
    // }
    // else {
    //     playerData.stocks = {}
    //     playerData.stocks[stock] = { buyPrice: buyPrice, shares: shares }
    // }
}

function buyStock(id: string, stock: string, shares: number, cost: number) {
    if (!playerExists(id)) {
        return
    }
    db.run(`INSERT INTO stocks (id, ticker, purchasePrice, shares) VALUES (?, ?, ?, ?)`, [id, stock.toUpperCase(), cost, shares])
    loseMoneyToBank(id, (cost * shares), false)
}

function _set_active_pet(id: string, pet: string) {
    db.run(`UPDATE economy SET activePet = ? WHERE id = ?`, [pet, id])
}
function _get_active_pet(id: string) {
    console.log(playerGetInfo<string>(id, "activePet"))
    return playerGetInfo<string>(id, "activePet")["activePet"]
}

function getEconomy(): { [id: string]: Omit<EconomyData, "stocks"> } {
    let economy = {}
    for (let player of db.query("SELECT * from economy").iterate()) {
        economy[player.id] = player
    }
    return economy
}

function getLottery(): typeof lottery {
    const numbers =  db.query("SELECT pool, n1, n2, n3 FROM lottery").get()
    return {
        pool: Number(numbers["pool"]),
        numbers: [Number(numbers["n1"]), Number(numbers["n2"]), Number(numbers["n3"])]
    }
}


async function getStockInformation(quote: string, cb?: (data: { change: number, price: number, "%change": string, volume: string, name: string } | false) => any, fail?: (err: any) => any): Promise<{ change: number, price: number, "%change": string, volume: string, name: string } | false> {
    if (!quote)
        return false
    let data: { change: number, price: number, "%change": string, volume: string, name: string } = { change: 0, price: 0, "%change": "0%", volume: "0", name: quote.toUpperCase() }
    let json
    try {
        const key = getConfigValue("secrets.stockKey")
        json = await (await fetch(`https://finnhub.io/api/v1/quote?symbol=${quote.toUpperCase()}&token=${key}`)).json()
    }
    catch (err) {
        if (fail)
            fail(err)
        return false
    }

    const open = json["o"]
    const nPrice = json["c"]
    let nChange = Math.round((nPrice - open) * 10000) / 10000
    const pChange = Math.round((nChange / open) * 100 * 100) / 100
    data["change"] = nChange
    data["price"] = nPrice
    data["%change"] = String(pChange)
    data["volume"] = '0'
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
    calculateBaseInterest,
    calculateTaxPercent,
    playerExists,
    getMoney,
    getLoan,
    playerCount,
    getStocks,
    givePoint,
    getPoints
    // tradeItems
}
