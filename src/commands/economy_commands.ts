import fs from 'fs'
import fetch = require("node-fetch")
import economy, { EconomyData } from '../economy'
import pet from "../pets"
import user_options from '../user-options'
import timer from '../timer'

import vars from '../vars'

import common from '../common'
import { ccmdV2, CommandCategory, createCommandV2, createHelpArgument, createHelpOption, crv, generateDefaultRecurseBans, handleSending, PagedEmbed, StatusCode } from '../common_to_commands'
import { fetchUser, efd, fetchUserFromClient, getToolIp, choice, isMsgChannel, isNumeric, fetchUserFromClientOrGuild, entriesOf } from '../util'
import { format } from '../parsing'
import { EmbedBuilder, Guild, User } from 'discord.js'
import { giveItem, saveItems } from '../shop'
import { DEVBOT } from '../globals'
import achievements from '../achievements'
import amountParser from '../amount-parser'
import { buyItem, hasItem, useItem, getInventory, getItems } from '../shop'

export default function*(): Generator<[string, Command | CommandV2]> {

    yield ["#calcet", ccmdV2(async function() {
        let ip = getToolIp()

        if (!ip) {
            return crv("Euro has not added the special file", {
                status: StatusCode.ERR
            })
        }

        let res;
        try {
            res = await fetch.default(`http://${ip}/total`)
        }
        catch (err) {
            return crv("Could not fetch data", { status: StatusCode.ERR })
        }

        let toolTotal = Number(await res.text())
        return crv(`$${toolTotal}`)
    }, "Total amount on tools bot")]

    yield ["retire", ccmdV2(async function({ msg }) {
        if (Object.keys(economy.getEconomy()).length < 3) {
            return crv("Cannot retire if there are 2 or less people in the economy", { status: StatusCode.ERR })
        }
        let percentage = economy.playerLooseNetWorth(msg.author.id) / economy.economyLooseGrandTotal().total
        if (percentage >= 0.5) {
            economy.retirePlayer(msg.author.id)
            return crv("CONGRATS, you retired")
        }
        vars.setVar('!retire:retired', 'false', msg.author.id)
        return crv("You cannot retire :( you must have >= 50% of the economy")
    }, "lets you retire and get retirement benifits")]

    yield ['exchange-rate', ccmdV2(async function({ args, opts }) {
        let ip = getToolIp()

        if (!ip) {
            return crv("Euro has not added the special file", {
                status: StatusCode.ERR
            })
        }

        let res;
        try {
            res = await fetch.default(`http://${ip}/total`)
        }
        catch (err) {
            return crv("Could not fetch data", { status: StatusCode.ERR })
        }

        let toolTotal = Number(await res.text())

        let economyTotal = economy.economyLooseGrandTotal().moneyAndStocks

        let answer: [string, number]
        if (args[0] === 'tte') {
            answer = ["\\# -> [", economyTotal / toolTotal]
        }
        else {
            answer = ["\\[ -> #", toolTotal / economyTotal]
        }
        if (opts.getBool("raw", false)) {
            return crv(`${answer[1]}`)
        }
        return crv(answer.join(": "))

    }, "Calculate the exchange rate between tool's bot and this bot", {
        helpArguments: {
            tte: createHelpArgument("Gets the exchange rate from tool to euro instead of euro to tool", false)
        },
        helpOptions: {
            raw: createHelpOption("Gets just the number")
        }
    })]

    yield ['inflation', ccmdV2(async () => crv(`${economy.getInflation() * 100}%`), "Gets the inflation% over the past minute")]

    yield [
        "exchange", ccmdV2(async function({ args, msg }) {
            let ip = getToolIp()

            if (!ip) {
                return crv("Euro has not added the special file", {
                    status: StatusCode.ERR
                })
            }

            let canExchange = timer.has_x_m_passed(msg.author.id, "%exchange", 3, true)

            if (!canExchange) {
                let lap = Number(timer.do_lap(msg.author.id, "%exchange")) / 1000 / 60
                return crv(`You must wait ${3 - (lap)} minutes`)
            }

            timer.createOrRestartTimer(msg.author.id, "%exchange")

            let res;
            try {
                res = await fetch.default(`http://${ip}/total`)
            }
            catch (err) {
                return crv("Could not fetch data", { status: StatusCode.ERR })
            }

            let toolTotal = await res.json()

            let economyTotal = economy.economyLooseGrandTotal().moneyAndStocks

            let exchangeRate = toolTotal / economyTotal

            let amount = economy.calculateAmountFromString(msg.author.id, args[0])

            if (amount / economy.playerLooseNetWorth(msg.author.id) >= .5) {
                let ach = achievements.achievementGet(msg, "even transfer")
                if (ach)
                    await handleSending(msg, ach)
            }

            let nAmount = amount
            if (!economy.canBetAmount(msg.author.id, nAmount)) {
                return { content: `You do not have this much money`, status: StatusCode.ERR }
            }

            let amountAfterExchangeRate = nAmount * exchangeRate

            let response = await fetch.default(`http://${ip}/exchange`,
                { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: msg.author.id, money: amountAfterExchangeRate }) }
            )

            if (response.status === 400) {
                return crv(`Transaction denied (less than 1 dollar after transfer)`)
            }

            economy.loseMoneyToBank(msg.author.id, nAmount)

            let sign = user_options.getOpt(msg.author.id, "currency-sign", common.GLOBAL_CURRENCY_SIGN)

            return { content: `You transfered ${sign}${nAmount} to #${amountAfterExchangeRate}`, status: StatusCode.RETURN }
        }, "Transfer money to tools bot", {
            helpArguments: {
                amount: createHelpArgument("the amount to transfer", true)
            },
            permCheck: () => !DEVBOT
        })
    ]

    yield [
        "buy", ccmdV2(async function({ msg, args }) {

            let allowedTypes = ["stock", "pet", "item"]

            let type = args[0]

            if (!allowedTypes.includes(type)) {
                return { content: `Usage: \`${common.prefix}buy <${allowedTypes.join("|")}> ...\``, status: StatusCode.ERR }
            }

            let item = args.slice(1).join(" ")
            if (!item) {
                return { content: "No item specified", status: StatusCode.ERR }
            }
            let amount = Number(args[args.length - 1])
            if (!isNaN(amount)) {
                item = item.split(" ").slice(0, -1).join(" ")
            }

            switch (type) {
                case "stock": {
                    if (!amount || amount < 0) {
                        return { content: `${amount} is an invalid amount`, status: StatusCode.ERR }
                    }
                    let data = await economy.getStockInformation(item)
                    if (data === false) {
                        return { content: `${item} does not exist`, status: StatusCode.ERR }
                    }
                    let realStock = economy.userHasStockSymbol(msg.author.id, item)
                    if (!economy.canBetAmount(msg.author.id, data.price * amount)) {
                        return { content: "You cannot afford this", status: StatusCode.ERR }
                    }
                    if (realStock) {
                        economy.buyStock(msg.author.id, realStock.name, amount, data.price)
                    }
                    else {
                        economy.buyStock(msg.author.id, item.toUpperCase(), amount, data.price)
                    }
                    return { content: `${msg.author} has bought ${amount} shares of ${item.toUpperCase()} for ${user_options.getOpt(msg.author.id, "currency-sign", common.GLOBAL_CURRENCY_SIGN)}${data.price * amount}`, status: StatusCode.RETURN }
                }
                case "pet": {
                    if (!item) {
                        return { content: "You didnt specify a pet", status: StatusCode.ERR }
                    }
                    let shopData = pet.getPetShop()
                    item = item.toLowerCase()
                    if (!shopData[item]) {
                        return { content: `${item}: not a valid pet`, status: StatusCode.ERR }
                    }
                    let petData = shopData[item]
                    let totalCost = 0
                    for (let cost of petData.cost) {
                        totalCost += amountParser.calculateAmountRelativeTo(economy.playerLooseNetWorth(msg.author.id), cost)
                    }
                    if (!economy.canBetAmount(msg.author.id, totalCost)) {
                        return { content: "You do not have enough money to buy this pet", status: StatusCode.ERR }
                    }
                    if (pet.buyPet(msg.author.id, item)) {
                        return { content: `You have successfuly bought: ${item} for: ${user_options.getOpt(msg.author.id, "currency-sign", common.GLOBAL_CURRENCY_SIGN)}${totalCost}\nTo activate it run ${common.prefix}sapet ${item}`, status: StatusCode.RETURN }
                    }
                    return { content: "You already have this pet", status: StatusCode.ERR }
                }
                case "item": {
                    if (Object.keys(economy.getEconomy()).length < 2) {
                        return crv("There are not enough people in the economy to use this", { status: StatusCode.ERR })
                    }
                    if (!amount)
                        amount = 1
                    if (msg.author.bot) {
                        return { content: "Bots cannot buy items", status: StatusCode.ERR }
                    }
                    if (!getItems()[item]) {
                        return { content: `${item} does not exist`, status: StatusCode.ERR }
                    }
                    let totalSpent = 0
                    for (let i = 0; i < amount; i++) {
                        let totalCost = 0
                        let { total } = economy.economyLooseGrandTotal(false)
                        for (let cost of getItems()[item].cost) {
                            totalCost += amountParser.calculateAmountRelativeTo(total, `${cost}`)
                        }
                        if (economy.canBetAmount(msg.author.id, totalCost) || totalCost == 0) {
                            if (buyItem(msg.author.id, item)) {
                                if (item === 'reset economy') {
                                    let ach = achievements.achievementGet(msg, "capitalist")
                                    if (ach) {
                                        await handleSending(msg, ach)
                                    }
                                }
                                economy.loseMoneyToBank(msg.author.id, totalCost)
                                totalSpent += totalCost
                            }
                            else {
                                return { content: `You already have the maximum of ${item}`, status: StatusCode.ERR }
                            }
                        }
                        else {
                            if (i > 0) {
                                return { content: `You ran out of money but bought ${i} item(s) for ${totalSpent}`, status: StatusCode.RETURN }
                            }
                            return { content: `This item is too expensive for u`, status: StatusCode.ERR }
                        }
                    }
                    if (totalSpent < 0) {
                        return crv("Cannot spend negative money in shop", { status: StatusCode.ERR })
                    }
                    return { content: `You bought: ${amount} ${item}(s) for ${user_options.getOpt(msg.author.id, "currency-sign", common.GLOBAL_CURRENCY_SIGN)}${totalSpent}`, status: StatusCode.RETURN }
                }
            }
            return { noSend: true, status: StatusCode.RETURN }

        }, "Buy stuff", {
            helpArguments: {
                shop: {
                    description: "can be either: <code>stock, pet, item</code>"
                },
                item: {
                    description: "What to buy from the  specified shop"
                },
                amount: {
                    description: "The  amount of items to buy from <q>shop</q>",
                    required: false
                }
            }
        })
    ]


    yield [
        "stocks", ccmdV2(async function({ args, msg }) {
            let user = args[0]
            let discordUser = user ? await fetchUserFromClient(common.client, user) : msg.author
            if (!discordUser) {
                return { content: `${user} not found`, status: StatusCode.ERR }
            }
            if (!economy.getEconomy()[discordUser.id] || !economy.getEconomy()[discordUser.id].stocks) {
                return { content: "You own no stocks", status: StatusCode.ERR }
            }
            let text = `<@${discordUser.id}>\n` +
                Array.from(Object.entries(economy.getEconomy()[discordUser.id].stocks ?? {}), ([stock, stockInfo]) => {
                    return `**${stock}**\nbuy price: ${stockInfo.buyPrice}\nshares: (${stockInfo.shares})`
                }).join(`\n-------------------------\n`)
            return { content: text || "No stocks", allowedMentions: { parse: [] }, status: StatusCode.RETURN }

        }, "Get the stocks of a user", {
            helpArguments: {
                user: createHelpArgument("The user to check the stocks of", false)
            }
        })
    ]

    yield [
        "loan", {
            run: async (msg, _args, sendCallback) => {
                const userEconData = msg.author.economyData
                if (userEconData?.loanUsed) {
                    return { content: "U have not payed off your loan", status: StatusCode.ERR }
                }
                if (userEconData?.money >= 0) {
                    return { content: "Ur not in debt", status: StatusCode.ERR }
                }
                const top = Object.values(economy.getEconomy()).sort((a, b) => b.money - a.money)[0]
                let max = top?.money || 100
                let needed = Math.abs(economy.getEconomy()[msg.author.id].money) + 1
                if (needed > max) {
                    needed = max
                }
                economy.addMoney(msg.author.id, needed)
                economy.useLoan(msg.author.id, needed)
                if (hasItem(msg.author.id, "loan")) {
                    useItem(msg.author.id, "loan")
                }
                return { content: `<@${msg.author.id}> Used a loan and got ${needed}`, status: StatusCode.RETURN }
            }, category: CommandCategory.ECONOMY,
            help: {
                info: `Use a loan
<br>A loan can only be used if you have payed off previous loans, and you are in debt`
            }
        },
    ]

    yield [
        "pay-loan", {
            run: async (msg, args, sendCallback) => {
                let amount = args[0] || "all!"
                let nAmount = economy.calculateLoanAmountFromString(msg.author.id, amount) * 1.01
                if (!msg.author.loan) {
                    return { content: "You have no loans to pay off", status: StatusCode.ERR }
                }
                if (!economy.canBetAmount(msg.author.id, nAmount)) {
                    return { content: "U do not have enough money to pay that back", status: StatusCode.ERR }
                }
                if (economy.payLoan(msg.author.id, nAmount)) {
                    return { content: "You have fully payed off your loan", status: StatusCode.RETURN }
                }
                return { content: `You have payed off ${nAmount} of your loan and have ${economy.getEconomy()[msg.author.id].loanUsed} left`, status: StatusCode.RETURN }
            }, category: CommandCategory.ECONOMY,
            help: {
                info: "Pay off your lown",
                arguments: {
                    amount: createHelpArgument("The amount to pay off", false, undefined, "100%")
                }
            }
        },
    ]

    yield [
        "inventory", ccmdV2(async function({ msg, opts, args }) {

            let user = await fetchUserFromClient(common.client, args[0] ?? msg.author.id)
            if (!user)
                return { content: `${args[0]}  not  found`, status: StatusCode.ERR }

            const ITEMS_PER_PAGE = 20

            let sortFunction = opts.getBool("n", false) ? ([_, count]: [string, number], [_2, count2]: [string, number]) => count2 - count : ([name, _]: [string, number], [name2, _2]: [string, number]) => name > name2 ? 1 : -1

            const PLAYER_INV = Object.entries(getInventory()[user.id]).sort(sortFunction)

            const embedPages: EmbedBuilder[] = []

            let au = user.avatarURL()

            const totalPages = Math.ceil(PLAYER_INV.length / ITEMS_PER_PAGE)

            for (let chunk = 0; chunk < PLAYER_INV.length; chunk += ITEMS_PER_PAGE) {
                let e = new EmbedBuilder().setTitle("ITEMS")
                if (au)
                    e.setThumbnail(au)

                for (let [name, count] of PLAYER_INV.slice(chunk, chunk + ITEMS_PER_PAGE)) {
                    e.addFields({ name, value: String(count), inline: true })
                }

                e.setDescription(`page: ${(chunk + 20) / 20} / ${totalPages}`)
                e.setFooter({ text: `type n/p to go to the next/previous page\nor type a page number to go to that page` })
                embedPages.push(e)
            }

            let paged = new PagedEmbed(msg, embedPages, "inventory")
            await paged.begin()

            return { noSend: true, status: StatusCode.INFO }
        }, "Get the inventory of a user", {
            helpArguments: {
                user: createHelpArgument("The user to get info from", false, undefined, "@me")
            },
            helpOptions: {
                n: createHelpOption("Sort by numerical")
            }
        })
    ]

    yield [
        "pet-shop", ccmdV2(async function({ msg }) {
            let embed = new EmbedBuilder()
            const shopData = pet.getPetShop()
            for (let [pet, data] of entriesOf(shopData)) {
                let totalCost = 0
                for (let cost of data.cost) {
                    totalCost += amountParser.calculateAmountRelativeTo(msg.author.netWorth, cost)
                }
                embed.addFields(efd([`${pet}\n${user_options.formatMoney(msg.author.id, totalCost)}`, `${data.description}`, true]))
            }
            embed.setFooter({ text: `To buy a pet, do ${common.prefix}buy pet <pet name>` })
            return { embeds: [embed], status: StatusCode.RETURN }
        }, "See the pet shop")
    ]

    yield [
        "pets", {
            run: async (msg, args, sendCallback) => {
                let user = await fetchUserFromClientOrGuild(args[0] || msg.author.id, msg.guild)
                if (!user)
                    return { content: "User not found", status: StatusCode.ERR }
                let pets = pet.getUserPets(user.id)
                if (!pets) {
                    return { content: `<@${user.id}> does not have pets`, allowedMentions: { parse: [] }, status: StatusCode.ERR }
                }
                let e = new EmbedBuilder()
                e.setTitle(`${user.username}'s pets`)
                let activePet = pet.getActivePet(msg.author.id)
                e.setDescription(`active pet: ${activePet}`)
                for (let pet in pets) {
                    e.addFields(efd([pets[pet].name, `${pets[pet].health} hunger`, true]))
                }
                if (!activePet) {
                    e.setFooter({ text: `To set an active pet run: ${common.prefix}sapet <pet name>` })
                }
                return { embeds: [e], status: StatusCode.RETURN, allowedMentions: { parse: [] } }
            }, category: CommandCategory.ECONOMY,
            help: {
                info: "Get the pets of a user",
                arguments: {
                    user: createHelpArgument("The user to get the pets of")
                }
            }
        },
    ]

    yield [
        "shop", {
            run: async (msg, args, sendCallback, opts) => {
                let items = fs.readFileSync("./data/shop.json", "utf-8")
                let user = msg.author
                let userCheckingShop = user
                let itemJ = JSON.parse(items)
                let pages = []
                let i = 0
                let e = new EmbedBuilder()
                let au = msg.author.avatarURL()
                if (au) {
                    e.setThumbnail(au)
                }
                let userShopAu = userCheckingShop.avatarURL()
                if (userShopAu)
                    e.setFooter({ text: `Viewing shop as: ${userCheckingShop.username}`, iconURL: userShopAu })
                else {
                    e.setFooter({ text: `Viewing shop as: ${userCheckingShop.username}` })
                }
                let round = !opts['no-round']
                for (let item in itemJ) {
                    i++;
                    let totalCost = 0
                    let { total } = economy.economyLooseGrandTotal(false)
                    for (let cost of itemJ[item].cost) {
                        totalCost += amountParser.calculateAmountRelativeTo(total, cost)
                    }
                    if (round) {
                        totalCost = Math.floor(totalCost * 100) / 100
                    }
                    let text = `**${totalCost == Infinity ? "puffle only" : `${user_options.getOpt(msg.author.id, "currency-sign", common.GLOBAL_CURRENCY_SIGN)}${totalCost}`}**\n${itemJ[item].description}`
                    if (itemJ[item]['puffle-banned']) {
                        text += '\n**buy only**'
                    }
                    e.addFields(efd([item.toUpperCase(), text, true]))
                    if (i % 25 == 0) {
                        pages.push(e)
                        e = new EmbedBuilder()
                        if (au)
                            e.setThumbnail(au)
                        i = 0
                    }
                }
                if ((e.data.fields?.length || 0) > 0) {
                    pages.push(e)
                }
                return { embeds: pages, status: StatusCode.RETURN }
            }, category: CommandCategory.ECONOMY,
            help: {
                info: "List items in the shop",
            }
        },
    ]

    yield [
        "profits", {
            run: async (msg, args, sendCallback, opts) => {
                if (!economy.getEconomy()[msg.author.id] || !economy.getEconomy()[msg.author.id].stocks) {
                    return { content: "You own no stocks", status: StatusCode.ERR }
                }
                let totalProfit = 0
                let totalDailiyProfit = 0
                let text = ""
                let totalValue = 0
                let promises = []
                let fmt = args.join(" ") || "%i"
                let ffmt = opts['ffmt'] || "%i\n%f"
                for (let stock in economy.getEconomy()[msg.author.id].stocks) {
                    stock = stock.replace(/\(.*/, "").toUpperCase().trim()
                    promises.push(economy.getStockInformation(stock))
                }
                try {
                    let rPromises = await Promise.all(promises)
                    for (let stockInfo of rPromises) {
                        if (!stockInfo) continue;

                        let userStockData = economy.userHasStockSymbol(msg.author.id, stockInfo.name)
                        if (!userStockData)
                            continue

                        let stockName = userStockData.name

                        let userStockInfo = economy.getEconomy()[msg.author.id].stocks?.[stockName]
                        if (!userStockInfo) continue;

                        let profit = (stockInfo.price - userStockInfo.buyPrice) * userStockInfo.shares
                        totalProfit += profit

                        let todaysProfit = (Number(stockInfo.change) * userStockInfo.shares)
                        totalDailiyProfit += todaysProfit

                        totalValue += stockInfo.price * userStockInfo.shares

                        text += format(fmt, {
                            i: `**${stockName}**\nPrice: ${stockInfo.price}\nChange: ${stockInfo.change}\nProfit: ${profit}\nTodays profit: ${todaysProfit}\n---------------------------\n`,
                            p: String(stockInfo.price),
                            c: String(stockInfo.change),
                            "+": String(profit),
                            "^": String(todaysProfit),
                            v: String(stockInfo.price * userStockInfo.shares),
                            n: stockInfo.name,
                            "N": stockName,
                            d: "\n---------------------------\n"
                        })
                    }
                }
                catch (err) {
                    return { content: "Something went wrong", status: StatusCode.ERR }
                }
                return { content: format(String(ffmt), { i: text, f: `TOTAL TODAY: ${totalDailiyProfit}\nTOTAL PROFIT: ${totalProfit}\nTOTAL VALUE: ${totalValue}`, '^': String(totalDailiyProfit), '+': String(totalProfit), v: String(totalValue) }), status: StatusCode.RETURN }
            }, category: CommandCategory.ECONOMY,
            help: {
                arguments: {
                    format: createHelpArgument("The format to print each stock<br><lh>Format specifiers</lh><ul><li><b>i</b>: general information</li><li><b>p</b>: current price</li><li><b>c</b>: change</li><li><b>+</b>: profit</li><li><b>^</b>: today's profit</li><li><b>v</b>: value</li><li><b>n</b>: stock name</li><li><b>N</b>: name of stock used in this bot</li><li><b>d</b>: a generic dashed divider</li></ul>")
                }
            }
        },
    ]

    yield [
        "profit", {
            run: async (msg, args, sendCallback) => {
                if (!economy.getEconomy()[msg.author.id] || !economy.getEconomy()[msg.author.id].stocks) {
                    return { content: "You own no stocks", status: StatusCode.ERR }
                }
                let stock = args[0]
                let fmt = args.slice(1).join(" ").trim() || "{embed}"
                if (!stock) {
                    return { content: "No stock given", status: StatusCode.ERR }
                }
                let data = await economy.getStockInformation(stock)
                if (!data) {
                    return { content: "No stock data found", status: StatusCode.ERR }
                }
                let embed = new EmbedBuilder()
                let stockInfo = economy.userHasStockSymbol(msg.author.id, stock)
                if (!stockInfo) {
                    return { content: "You do not have this stock", status: StatusCode.ERR }
                }
                let stockName = stockInfo.name
                let profit = (data.price - stockInfo.info.buyPrice) * stockInfo.info.shares
                let todaysProfit = (Number(data.change) * stockInfo.info.shares)
                embed.setTitle(stockName)
                embed.setThumbnail(msg.member?.user.avatarURL()?.toString() || "")
                if (profit > 0) {
                    embed.setColor("Green")
                }
                else {
                    embed.setColor("Red")
                }
                embed.addFields(efd(["Price", String(data.price), true], ["Change", String(data.change) || "N/A", true], ["Change %", String(data["%change"]) || "N/A", true], ["Profit", String(profit), true], ["Today's Profit", String(todaysProfit), true], ["Value", String(data.price * stockInfo.info.shares)]))
                if (fmt == "{embed}") {
                    return { embeds: [embed], status: StatusCode.ERR }
                }
                else {
                    return {
                        content: format(fmt, {
                            p: String(data.price),
                            c: String(data.change),
                            C: String(data["%change"]),
                            P: String(profit),
                            T: String(todaysProfit),
                            v: String(data.price * stockInfo.info.shares)
                        }),
                        status: StatusCode.RETURN
                    }
                }
            }, category: CommandCategory.ECONOMY,
            help: {
                info: "Get the profit you have made on a specific stock",
                arguments: {
                    stock: createHelpArgument("The stock to get the profit of", true)
                }
            }
        },
    ]

    yield [
        "sell", {
            run: async (msg, args, sendCallback) => {
                if (!economy.getEconomy()[msg.author.id] || !economy.getEconomy()[msg.author.id].stocks) {
                    return { content: "You own no stocks", status: StatusCode.ERR }
                }
                let stock = args[0]
                if (!stock)
                    return { content: "no stock given", status: StatusCode.ERR }
                if (stock == common.prefix) {
                    return { "content": "Looks like ur pulling a tool", status: StatusCode.ERR }
                }
                stock = stock.toUpperCase()
                let amount = args[1]
                let data
                try {
                    data = await fetch.default(`https://finance.yahoo.com/quote/${encodeURI(args[0])}`)
                }
                catch (err) {
                    return { content: "Could not fetch data", status: StatusCode.ERR }
                }
                let text = await data.text()
                if (!text) {
                    return { content: "No data found", status: StatusCode.ERR }
                }
                let stockData = text.matchAll(new RegExp(`data-symbol="${args[0].toUpperCase().trim().replace("^", ".")}"([^>]+)>`, "g"))
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
                    return { content: "This does not appear to be a stock", status: StatusCode.ERR }
                }
                let nPrice = Number(jsonStockInfo["regularMarketPrice"])
                let realStockInfo = economy.userHasStockSymbol(msg.author.id, stock)
                let stockName = stock
                if (realStockInfo)
                    stockName = realStockInfo.name
                if (!economy.getEconomy()[msg.author.id].stocks?.[stockName]) {
                    return { content: "You do not own this stock", status: StatusCode.ERR }
                }
                else {
                    let stockInfo = economy.getEconomy()[msg.author.id].stocks?.[stockName]
                    if (!stockInfo) return crv("Could not get stock info", { status: StatusCode.ERR })
                    let sellAmount = economy.calculateStockAmountFromString(msg.author.id, stockInfo.shares, amount)
                    if (!sellAmount || sellAmount <= 0) {
                        return { content: "You must sell a number of shares of your stock", status: StatusCode.ERR }
                    }
                    if (sellAmount > stockInfo.shares) {
                        return { content: "YOu do not own that many shares", status: StatusCode.ERR }
                    }
                    if (sellAmount <= 0) {
                        return { content: "Must sell more than 0", status: StatusCode.ERR }
                    }
                    let profit = (nPrice - stockInfo.buyPrice) * sellAmount
                    economy.sellStock(msg.author.id, stockName, sellAmount, nPrice)
                    economy.addMoney(msg.author.id, profit)
                    return { content: `You sold: ${stockName} and made ${user_options.getOpt(msg.author.id, "currency-sign", common.GLOBAL_CURRENCY_SIGN)}${profit} in total`, status: StatusCode.RETURN }
                }
            }, category: CommandCategory.ECONOMY,
            help: {
                info: "Sell a stock",
                arguments: {
                    stock: createHelpArgument("The stock to sell", true),
                    amount: createHelpArgument("The amount of shares to sell", true, "stock")
                }
            }
        },
    ]

    yield [
        "nw", createCommandV2(async ({ msg, args }) => {
            let user;

            if (!args.join(" ")) {
                user = msg.author
            }
            else {
                user = await fetchUserFromClientOrGuild(args.join(" "), msg.guild)
            }
            if (!user) user = msg.author
            if (!user) return { content: "No user found", status: StatusCode.ERR }
            let amount = economy.playerLooseNetWorth(user.id)
            let money_format = user_options.getOpt(user.id, "money-format", "**{user}**\n${amount}")
            return { content: format(money_format, { user: user.username, amount: String(amount), ramount: String(Math.floor(amount * 100) / 100) }, true), recurse: generateDefaultRecurseBans(), status: StatusCode.RETURN, do_change_cmd_user_expansion: false }
        }, CommandCategory.ECONOMY, "gets the net worth of a user", {
            user: createHelpArgument("The user to get the net worth of")
        }),
    ]

    yield [
        "money", createCommandV2(async ({ rawOpts: opts, msg, args }) => {
            let user: User | undefined = msg.author
            if (args.join(" "))
                user = await fetchUserFromClientOrGuild(args.join(" "), msg.guild)
            if (!user)
                user = msg.author
            let money_format = user_options.getOpt(user.id, "money-format", `{user}\n${user_options.getOpt(msg.author.id, 'currency-sign', common.GLOBAL_CURRENCY_SIGN)}{amount}`)
            let text = ""
            if (economy.getEconomy()[user.id]) {
                if (opts['m']) {
                    text += `${economy.getEconomy()[user.id].money}\n`
                }
                if (opts['l']) {
                    text += `${timer.do_lap(msg.author.id, "%can-earn")}\n`
                }
                if (opts['t']) {
                    text += `${timer.do_lap(msg.author.id, "%last-taxed")}\n`
                }
                if (opts['nw']) {
                    text += `${economy.playerLooseNetWorth(user.id)}\n`
                }
                if (text) {
                    return { content: text, status: StatusCode.RETURN }
                }
                if (opts['no-round']) {
                    return { content: format(money_format, { user: user.username, amount: String(economy.getEconomy()[user.id].money) }, true), recurse: generateDefaultRecurseBans(), allowedMentions: { parse: [] }, status: StatusCode.RETURN, do_change_cmd_user_expansion: false }
                }
                return { content: format(money_format, { user: user.username, amount: String(Math.round(economy.getEconomy()[user.id].money * 100) / 100) }, true), recurse: generateDefaultRecurseBans(), allowedMentions: { parse: [] }, status: StatusCode.RETURN, do_change_cmd_user_expansion: false }
            }
            return { content: "none", status: StatusCode.RETURN }
        }, CommandCategory.ECONOMY,
            "Get the money of a user",
            {
                "user": createHelpArgument("The user to get the money of", false)
            },
            {
                "m": createHelpOption("Show money only"),
                "l": createHelpOption("Show the last time they got money from talking"),
                "t": createHelpOption("Show the  last time they got taxed"),
                "nw": createHelpOption("Get the raw networth of a player"),
                "no-round": createHelpOption("No rounding"),
            }
        ),
    ]

    yield [
        "work",
        {
            run: async (msg, _args, sendCallback) => {
                let canWork = economy.canWork(msg.author.id)
                let currency_sign = user_options.getOpt(msg.author.id, "currency-sign", "$")
                let ip = getToolIp()
                if (!ip) {
                    return crv("No ip", { status: StatusCode.ERR })
                }
                let res = await fetch.default(`http://${ip}`)
                let json = await res.json()
                //0 means that it has been an hour, but they are not broke
                if (canWork === 0 && json[msg.author.id]?.major === 'graduated') {
                    let events: { [key: string]: (amount: number) => false | { message: string, gain: number, lose: number } } = {
                        fired: (amount) => {
                            return { message: `Looks like you got fired, the boss took ${currency_sign}${amount}`, gain: 0, lose: amount }
                        },
                        murderer: (amount) => {
                            return { message: `There was an asassin waiting for you at the door, luckily they missed your heart but you had to pay ${currency_sign}${amount * 2} at the hospital`, gain: 0, lose: amount * 2 }
                        },
                        toolbox: (amount) => {
                            return { message: `Toolbox does not like decimal points, so you gain an extra: ${currency_sign}${Math.ceil(amount) - amount} because of rounding errors!!!!!\n Gain a total of: ${currency_sign}${Math.ceil(amount)}!!`, gain: Math.ceil(amount), lose: 0 }
                        },
                        "back-ally-deal": amount => {
                            let gain = amountParser.calculateAmountRelativeTo(economy.economyLooseGrandTotal().total, "25%")
                            return { message: `Instead of going to work you made a back ally deal with the drug ring and they paid you: ${currency_sign}${gain}`, gain: gain, lose: 0 }
                        }
                    }
                    let amount = economy.work(msg.author.id)
                    if (Math.random() > .95 && amount) {
                        let event = choice(Object.values(events))(amount)
                        if (event) {
                            economy.addMoney(msg.author.id, event.gain)
                            economy.loseMoneyToBank(msg.author.id, event.lose)
                            return { content: event.message, status: StatusCode.RETURN }
                        }
                    }
                    return { content: `Congrats, you grad student, here's ${currency_sign}${amount} from your job`, status: StatusCode.RETURN }
                }
                if (canWork) {
                    let amount = economy.work(msg.author.id)
                    return { content: `You earned: ${currency_sign}${amount}`, status: StatusCode.RETURN }
                }
                return { content: "No working for you bubs", status: StatusCode.ERR }
            }, category: CommandCategory.ECONOMY,
            help: {
                info: `Earn money (.1% of the economy) if your net worth is below 0 or if you graduated #school\nYou can work once per hour`
            }
        },
    ]

    yield [
        "give", {
            run: async (msg, args, sendCallback) => {

                if (!hasItem(msg.author.id, "donation card")) {
                    return crv("You must have the donation card", { status: StatusCode.ERR })
                }
                let user: User = msg.author;
                let amount;
                if (msg.mentions.users.at(0)) {
                    args = args.map(v => v.replaceAll(msg.mentions.users.at(0)?.toString() as string, "")).filter(v => v)
                    user = msg.mentions.users.at(0) as User
                    amount = args[0]
                }
                else {
                    let searchUser;
                    [amount, ...searchUser] = args

                    let userSearch = searchUser.join(" ")
                    if (!userSearch) {
                        return { content: "No user to search for", status: StatusCode.ERR }
                    }
                    if (msg.guild) {
                        user = (await fetchUser(msg.guild as Guild, userSearch))?.user as User
                    }
                    else {
                        user = await fetchUserFromClient(common.client, userSearch) as User
                    }
                    if (!user)
                        return { content: `${userSearch} not found`, status: StatusCode.ERR }
                }

                let realAmount = economy.calculateAmountFromString(msg.author.id, amount)

                if (!realAmount) {
                    return { content: "Nothing to give", status: StatusCode.ERR }
                }

                if (realAmount < 0) {
                    return { content: "What are you trying to pull <:Watching1:697677860336304178>", status: StatusCode.ERR }
                }

                if (economy.getEconomy()[user.id] === undefined) {
                    return { content: `${user.id} is not in the economy`, status: StatusCode.ERR }
                }
                if (economy.canBetAmount(msg.author.id, realAmount) && !user.bot) {
                    economy.loseMoneyToPlayer(msg.author.id, realAmount, user.id)
                    return { content: `You gave ${realAmount} to ${user.username}`, status: StatusCode.RETURN }
                }
                else {
                    return { content: `You cannot give away ${realAmount}`, status: StatusCode.ERR }
                }
            }, category: CommandCategory.ECONOMY,
            help: {
                info: "Give a user money",
                arguments: {
                    amount: createHelpArgument("The amount to give"),
                    "...user": createHelpArgument("The user to give the money to")
                }
            },
            prompt_before_run: true
        },
    ]

    yield [
        "give-stock", createCommandV2(async ({ msg, args }) => {
            let stock = args[0]
            let a = args[1]
            let sn = stock
            let userStockData = economy.userHasStockSymbol(msg.author.id, sn)
            if (!userStockData) {
                return { content: "You do not own that stock", status: StatusCode.ERR }
            }
            let amount = economy.calculateStockAmountFromString(msg.author.id, userStockData.info.shares, a) as number
            if (amount <= 0) {
                return { content: `Invalid share count`, status: StatusCode.ERR }
            }
            if (amount > userStockData.info.shares) {
                return { content: "You dont have that many shares", status: StatusCode.ERR }
            }
            let player = args.slice(2).join(" ")

            if (!msg.guild) return crv("Must be in a guild", { status: StatusCode.ERR })

            let member = await fetchUser(msg.guild, player)
            if (!member) {
                return { content: `Member: ${player} not found`, status: StatusCode.ERR }
            }
            if (!economy.getEconomy()[member.id]) {
                return { content: "Cannot give stocks to this player", status: StatusCode.ERR }
            }
            userStockData.info.shares -= amount
            //let otherStockInfo = economy.getEconomy()[member.id]?.stocks?.[stockName] || {}
            let otherStockInfo = economy.userHasStockSymbol(member.id, sn)
            if (!otherStockInfo) {
                otherStockInfo = {
                    name: sn, info: {
                        buyPrice: userStockData.info.buyPrice,
                        shares: amount
                    }
                }
            }
            else {
                let oldShareCount = otherStockInfo.info.shares
                let newShareCount = otherStockInfo.info.shares + amount
                otherStockInfo.info.buyPrice = (otherStockInfo.info.buyPrice * (oldShareCount / newShareCount)) + (userStockData.info.buyPrice * (amount / newShareCount))
                otherStockInfo.info.shares += amount
            }
            //economy.giveStock(member.id, stockName, otherStockInfo.buyPrice, otherStockInfo.shares)
            economy.setUserStockSymbol(msg.author.id, userStockData)
            economy.setUserStockSymbol(member.id, otherStockInfo)
            if (userStockData.info.shares == 0) {
                economy.removeStock(msg.author.id, sn)
            }
            return { content: `<@${msg.author.id}> gave ${member} ${amount} shares of ${sn}`, allowedMentions: { parse: [] }, status: StatusCode.RETURN }
        }, CommandCategory.ECONOMY,
            "Give a stock to a user",
            {
                stock: createHelpArgument("The stock to give"),
                shares: createHelpArgument("The amount of shares to give"),
                user: createHelpArgument("The user to give the shares to"),
            }
        ),
    ]

    yield [
        "give-item", {
            run: async (msg, args, sendCallback) => {
                let user = msg.author;
                if (msg.mentions.users.at(0)) {
                    args = args.map(v => v.replaceAll(msg.mentions.users.at(0)?.toString() as string, "").trim()).filter(v => v)
                    user = msg.mentions.users.at(0) as User
                }
                else {
                    let search = args.slice(-1)[0]
                    if (msg.guild) {
                        user = (await fetchUser(msg.guild as Guild, search))?.user as User
                    }
                    else {
                        user = (await fetchUserFromClient(common.client, search)) as User
                    }
                    if (!user) {
                        return { content: `${user} not found`, status: StatusCode.ERR }
                    }
                    args = args.slice(0, -1)
                }

                let i = args.join(" ")

                if (!user) {
                    return { content: `Improper  command usage, \`${common.prefix}give-item [count] <item> <user>\``, status: StatusCode.ERR }
                }

                let [count, ...item] = i.split(" ")

                let itemstr = item.join(" ")
                if (!itemstr && isNaN(Number(count))) {
                    itemstr = count
                    count = "1"
                }
                else if (!itemstr) {
                    return { content: `Improper  command usage, \`${common.prefix}give-item [count] <item> <user>\``, status: StatusCode.ERR }
                }


                let itemData = hasItem(msg.author.id, itemstr.toLowerCase())
                if (!itemData) {
                    return { content: `You do not have ${itemstr.toLowerCase()}`, status: StatusCode.ERR }
                }

                let countnum = Math.floor(amountParser.calculateAmountRelativeTo(itemData, count))
                if (countnum <= 0 || countnum > itemData) {
                    return { content: `You only have ${itemData} of ${itemstr.toLowerCase()}`, status: StatusCode.ERR }
                }

                giveItem(user.id, itemstr.toLowerCase(), countnum)
                useItem(msg.author.id, itemstr.toLowerCase(), countnum)

                return { content: `<@${msg.author.id}> gave <@${user.id}> ${countnum} of ${itemstr.toLowerCase()}`, allowedMentions: { parse: [] }, status: StatusCode.RETURN }

            }, category: CommandCategory.ECONOMY,
            help: {
                info: "Give a player an item",
                arguments: {
                    count: createHelpArgument("The amount of the item to give", false, undefined, "1"),
                    item: createHelpArgument("The item to give to another player", true),
                    player: createHelpArgument("The player to give the item to", true)
                }
            }
        },
    ]

    yield [
        "tax", createCommandV2(async ({ msg, rawOpts: opts, args, sendCallback }) => {
            if (msg.author.bot) {
                return { content: "Bots cannot steal", status: StatusCode.ERR }
            }
            let canTax = timer.has_x_s_passed(msg.author.id, "%tax", 1.7, true)

            if (!canTax) {
                let lap = Number(timer.do_lap(msg.author.id, "%tax")) / 1000
                return crv(`You must wait ${1.7 - lap} seconds`)
            }

            timer.createOrRestartTimer(msg.author.id, "%tax")

            if (!canTax) {
                return { content: "You can only tax every 1.7 seconds", status: StatusCode.ERR }
            }

            if (!args.length) {
                await handleSending(msg, { content: "No user specified, erasing balance", status: StatusCode.INFO }, sendCallback)
                await new Promise(res => setTimeout(res, 1000))
                return { content: "Balance erased", status: StatusCode.RETURN }
            }

            if (!msg.guild) return { content: "Must be in a guild", status: StatusCode.ERR }

            let user = await fetchUser(msg.guild, args.join(" "))
            if (!user)
                return { content: `${args.join(" ")} not found`, status: StatusCode.ERR }
            if (user.user.bot) {
                return { content: "Looks like ur taxing a fake person", status: StatusCode.ERR }
            }
            let ct = economy.canTax(user.id)
            if (hasItem(user.id, "tax evasion")) {
                ct = economy.canTax(user.id, getInventory()[user.id]['tax evasion'] * 60)
            }
            let embed = new EmbedBuilder()
            if (ct) {
                embed.setTitle("Taxation Time")
                let userBeingTaxed = user.id
                let userGainingMoney = msg.author.id
                let taxAmount;
                let reflected = false
                let max = Infinity
                if (hasItem(userBeingTaxed, "tax shield")) {
                    max = economy.getEconomy()[userBeingTaxed].money
                }
                taxAmount = economy.taxPlayer(userBeingTaxed, max, false, economy.isRetired(userGainingMoney))
                if (taxAmount.amount == max) {
                    useItem(userBeingTaxed, "tax shield")
                }
                if (pet.getActivePet(userBeingTaxed) === 'frog' && userBeingTaxed !== userGainingMoney) {
                    let text = `<@${userBeingTaxed}> has a ${pet.hasPet(userBeingTaxed, "frog")?.name}!\n`
                    let playersToFrog = Object.entries(economy.getEconomy()).filter((a) => economy.playerLooseNetWorth(a[0]) > economy.playerLooseNetWorth(userBeingTaxed))
                    for (let player of playersToFrog) {
                        let amount = economy.playerLooseNetWorth(player[0]) * 0.001
                        economy.loseMoneyToPlayer(player[0], amount, userBeingTaxed)
                        text += `<@${player[0]}> has  been frogged for ${amount}\n`
                    }
                    await handleSending(msg, { content: text, allowedMentions: { parse: [] }, status: StatusCode.INFO }, sendCallback)
                }
                economy.addMoney(userGainingMoney, taxAmount.amount)
                if (opts['no-round'])
                    embed.setDescription(`<@${userBeingTaxed}> has been taxed for ${taxAmount.amount} (${taxAmount.percent}% of their money)`)
                else
                    embed.setDescription(`<@${userBeingTaxed}> has been taxed for ${Math.round(taxAmount.amount * 100) / 100} (${Math.round(taxAmount.percent * 10000) / 100}% of their money)`)
                if (reflected) {
                    return { content: "REFLECTED", embeds: [embed], status: StatusCode.RETURN }
                }
            }
            else if (economy.playerEconomyLooseTotal(msg.author.id) - (economy.getEconomy()[msg.author.id]?.loanUsed || 0) > 0) {
                embed.setTitle("REVERSE Taxation time")
                let amount = economy.calculateAmountFromStringIncludingStocks(msg.author.id, ".1%")
                embed.setDescription(`<@${user.user.id}> cannot be taxed yet, you are forced to give them: ${amount}`)
                economy.loseMoneyToPlayer(msg.author.id, amount, user.user.id)
            }
            else {
                embed.setTitle("TAX FAILURE")
                embed.setDescription(`<@${user.user.id}> cannot be taxed yet`)
            }
            return { embeds: [embed], status: StatusCode.RETURN }
        }, CommandCategory.ECONOMY,
            "Tax someone evily",
            {
                "no-round": createHelpOption("Dont round numbers"),
            },
            {
                user: createHelpArgument("The player to tax", true)
            }
        ),
    ]

    yield [
        "leaderboard", {
            run: async (msg, args, sendCallback, opts) => {
                let place = Number(args[0]) || 10
                if (opts['top']) {
                    place = parseInt(String(opts['top']))
                    if (isNaN(place)) {
                        place = 10
                    }
                }
                let embed = new EmbedBuilder()
                let text = ""
                let sortedEconomy: [string, EconomyData][] = []
                let econ = economy.getEconomy()
                if (opts['nw']) {
                    sortedEconomy = Object.entries(economy.getEconomy()).sort((a, b) => economy.playerLooseNetWorth(b[0]) - economy.playerLooseNetWorth(a[0]))
                }
                else if (opts['loan']) {
                    sortedEconomy = Object.entries(economy.getEconomy()).sort((a, b) => (b[1].loanUsed || 0) - (a[1].loanUsed || 0))
                }
                else {
                    sortedEconomy = Object.entries(economy.getEconomy()).sort((a, b) => a[1].money - b[1].money).reverse()
                }
                sortedEconomy = sortedEconomy.slice(0, place)
                let totalEconomy = 0
                if (opts['nw']) {
                    for (let id in econ) {
                        totalEconomy += economy.playerLooseNetWorth(id)
                    }
                }
                else if (opts['loan']) {
                    for (let id in econ) {
                        let value = econ[id]
                        totalEconomy += value.loanUsed || 0
                    }
                }
                else {
                    for (let id in econ) {
                        let value = econ[id]
                        totalEconomy += value.money
                    }
                }
                let excludeNeg = opts['no-neg'] ? true : false
                place = 0
                for (let user of sortedEconomy) {
                    let id = user[0]
                    let money = econ[id].money
                    if (opts['nw']) {
                        money = economy.playerLooseNetWorth(id)
                    }
                    else if (opts['loan']) {
                        money = econ[id].loanUsed || 0
                    }
                    if (money < 0 && excludeNeg) continue;
                    let percent = money / totalEconomy * 100
                    if (!opts['no-round']) {
                        money = Math.round(money * 100) / 100
                        percent = Math.round(percent * 100) / 100
                    }
                    if (opts['text']) {
                        text += `**${place + 1}**: <@${id}>: ${user_options.getOpt(msg.author.id, "currency-sign", common.GLOBAL_CURRENCY_SIGN)}${money} (${percent}%)\n`
                    }
                    else {
                        embed.addFields(efd([`${place + 1}`, `<@${id}>: ${user_options.getOpt(msg.author.id, "currency-sign", common.GLOBAL_CURRENCY_SIGN)}${money} (${percent}%)`, true]))
                    }
                    place++
                }
                if (opts['text'])
                    return { content: text, allowedMentions: { parse: [] }, status: StatusCode.RETURN }
                embed.setTitle(`Leaderboard`)
                embed.setURL("http://bircle.euro20179.com:8222/leaderboard")
                if (opts['no-round'])
                    embed.setDescription(`Total wealth: ${totalEconomy}`)
                else
                    embed.setDescription(`Total wealth: ${Math.round(totalEconomy * 100) / 100}`)
                return { embeds: [embed], status: StatusCode.RETURN }

            }, category: CommandCategory.ECONOMY,
            help: {
                info: "Get the top players in the economy",
                arguments: {
                    amount: {
                        description: "Show the  top x players",
                        required: false
                    }
                },
                options: {
                    "text": {
                        description: "Show text instead of an embed"
                    },
                    "loan": {
                        description: "Show the loan leaderboard",
                    },
                    "nw": {
                        description: "Show the net worth  leaderboard"
                    }
                },
            }
        },
    ]

    yield [
        "savee", {
            run: async (_msg, _args, sendCallback) => {
                economy.saveEconomy()
                saveItems()
                pet.savePetData()
                return { content: "Economy saved", status: StatusCode.RETURN }
            }, category: CommandCategory.ECONOMY,
            help: {
                info: "Saves the economy (by default, on every message send, there is a 45% chance to save the economy)"
            }
        },
    ]
}
