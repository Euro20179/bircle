"use strict";
const fs = require("fs");
let ECONOMY = {};
function loadEconomy() {
    if (fs.existsSync("./economy.json")) {
        let data = fs.readFileSync("./economy.json");
        ECONOMY = JSON.parse(data);
        if (ECONOMY['bank']) {
            delete ECONOMY['bank'];
        }
    }
}
function saveEconomy() {
    fs.writeFileSync("./economy.json", JSON.stringify(ECONOMY));
}
function createPlayer(id) {
    ECONOMY[id] = { money: 100, lastTalk: 0, lastTaxed: 0 };
}
function addMoney(id, amount) {
    if (ECONOMY[id]) {
        ECONOMY[id].money += amount;
    }
}
function loseMoneyToBank(id, amount) {
    if (ECONOMY[id]) {
        ECONOMY[id].money -= amount;
    }
}
function loseMoneyToPlayer(id, amount, otherId) {
    if (ECONOMY[id]) {
        ECONOMY[id].money -= amount;
    }
    if (ECONOMY[otherId] === undefined) {
        createPlayer(otherId);
    }
    ECONOMY[otherId].money += amount;
}
function earnMoney(id) {
    ECONOMY[id].lastTalk = Date.now();
    ECONOMY[id].money *= 1.001;
}
function taxPlayer(id) {
    ECONOMY[id].lastTaxed = Date.now();
    let taxPercent = (Math.random() * (.99 - .97) + .97);
    let amountTaxed = ECONOMY[id].money - (ECONOMY[id].money * taxPercent);
    ECONOMY[id].money *= taxPercent;
    return { amount: amountTaxed, percent: 1 - taxPercent };
}
function canEarn(id) {
    if (!ECONOMY[id])
        return false;
    let secondsDiff = (Date.now() - ECONOMY[id].lastTalk) / 1000;
    if (secondsDiff > 60) {
        return true;
    }
    return false;
}
function canTax(id) {
    if (!ECONOMY[id])
        return false;
    if (!ECONOMY[id].lastTaxed) {
        ECONOMY[id].lastTaxed = 0;
        return true;
    }
    if (ECONOMY[id].money === 0) {
        return false;
    }
    //@ts-ignore
    let secondsDiff = (Date.now() - ECONOMY[id].lastTaxed) / 1000;
    //5 minutes
    if (secondsDiff > 900) {
        return true;
    }
    return false;
}
function canBetAmount(id, amount) {
    if (ECONOMY[id] && amount <= ECONOMY[id].money) {
        return true;
    }
    return false;
}
function setMoney(id, amount) {
    if (ECONOMY[id]) {
        ECONOMY[id].money = amount;
    }
    else {
        createPlayer(id);
        ECONOMY[id].money = amount;
    }
}
function calculateAmountFromString(id, amount) {
    if (amount == undefined || amount == null) {
        return NaN;
    }
    if (ECONOMY[id] === undefined) {
        return NaN;
    }
    amount = amount.toLowerCase();
    if (amount == "all") {
        return ECONOMY[id].money;
    }
    if (Number(amount)) {
        return Number(amount);
    }
    else if (amount[0] === "$" && Number(amount.slice(1))) {
        return Number(amount.slice(1));
    }
    else if (amount[amount.length - 1] === "%") {
        let percent = Number(amount.slice(0, -1));
        if (!percent) {
            return 0;
        }
        let money = ECONOMY[id].money;
        return money * percent / 100;
    }
    return 0;
}
function reset() {
    ECONOMY = {};
    saveEconomy();
    loadEconomy();
}
loadEconomy();
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
    resetEconomy: reset
};
