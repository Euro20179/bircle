"use strict";
//TODO: add pets, and pet shop
//you have to keep your pet alive by feeding it
//each pet has an ability
//looses hunger slowly, food will be cheap
//nothing happens on death, just must be bought again
//eg: cat, gain .3% from talking instead of .1%
//eg: tiger, get taxed from .1 - .6% instead of .1 - .8%
//eg: dog, every 60 seconds, there is a 1% chance to dig up a treasure
//you can own as many pets as you like, you just must keep them alive, but you can only have one active at a time
Object.defineProperty(exports, "__esModule", { value: true });
exports.damagePet = exports.getUserPets = exports.getActivePet = exports.setActivePet = exports.savePetData = exports.feedPet = exports.hasPet = exports.buyPet = exports.getPetShop = exports.getPetInventory = void 0;
const fs = require("fs");
const { loseMoneyToBank, calculateAmountFromStringIncludingStocks, _set_active_pet, ECONOMY } = require("./economy.js");
let PETSHOP = {};
let PETINVENTORY = {};
function loadPets() {
    if (fs.existsSync("./pets.json")) {
        PETSHOP = JSON.parse(fs.readFileSync("./pets.json", "utf-8"));
    }
    if (fs.existsSync("./petinventory.json")) {
        PETINVENTORY = JSON.parse(fs.readFileSync("./petinventory.json", "utf-8"));
    }
}
function savePetData() {
    fs.writeFileSync("./petinventory.json", JSON.stringify(PETINVENTORY));
}
exports.savePetData = savePetData;
function getPetInventory() {
    return PETINVENTORY;
}
exports.getPetInventory = getPetInventory;
function getPetShop() {
    return PETSHOP;
}
exports.getPetShop = getPetShop;
function buyPet(id, pet) {
    if (PETINVENTORY[id]) {
        if (PETINVENTORY[id][pet]) {
            return false;
        }
        PETINVENTORY[id][pet] = PETSHOP[pet]["max-hunger"];
        let total = 0;
        for (let cost of PETSHOP[pet].cost) {
            total += calculateAmountFromStringIncludingStocks(id, cost);
        }
        loseMoneyToBank(id, total);
        return true;
    }
    else {
        PETINVENTORY[id] = { [pet]: PETSHOP[pet]["max-hunger"] };
        let total = 0;
        for (let cost of PETSHOP[pet].cost) {
            total += calculateAmountFromStringIncludingStocks(id, cost);
        }
        loseMoneyToBank(id, total);
        return true;
    }
}
exports.buyPet = buyPet;
function getUserPets(id) {
    return PETINVENTORY[id];
}
exports.getUserPets = getUserPets;
function hasPet(id, pet) {
    return PETINVENTORY[id]?.[pet];
}
exports.hasPet = hasPet;
function feedPet(id, pet, itemName) {
    if (!PETINVENTORY[id]?.[pet]) {
        return false;
    }
    let amount;
    switch (itemName) {
        case "bone": {
            let max = PETSHOP[pet]["max-hunger"];
            amount = Math.floor(Math.random() * 3 + 2);
            PETINVENTORY[id][pet] += amount;
            if (PETINVENTORY[id][pet] > max) {
                PETINVENTORY[id][pet] = max;
            }
            break;
        }
        default:
            return false;
    }
    return amount;
}
exports.feedPet = feedPet;
function setActivePet(id, pet) {
    if (PETINVENTORY[id]?.[pet]) {
        _set_active_pet(id, pet);
        return true;
    }
    return false;
}
exports.setActivePet = setActivePet;
function getActivePet(id) {
    let activePet = ECONOMY()[id]?.activePet;
    if (activePet)
        return activePet;
    return false;
}
exports.getActivePet = getActivePet;
function killPet(id, pet) {
    if (PETINVENTORY[id]?.[pet]) {
        delete PETINVENTORY[id][pet];
        return true;
    }
    return false;
}
function damagePet(id, pet) {
    if (PETINVENTORY[id]?.[pet]) {
        PETINVENTORY[id][pet] -= Math.floor(Math.random() * 4 + 1);
        if (PETINVENTORY[id][pet] <= 0) {
            killPet(id, pet);
            return 2;
        }
        return 1;
    }
    return 0;
}
exports.damagePet = damagePet;
loadPets();
