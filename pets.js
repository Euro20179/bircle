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
exports.getPetInventory = void 0;
const fs = require("fs");
let PETSHOP = {};
let PETINVENTORY;
function loadPets() {
    if (fs.existsSync("./pets.json")) {
        PETSHOP = JSON.parse(fs.readFileSync("./pets.json", "utf-8"));
    }
    if (fs.existsSync("./petinventory.json")) {
        PETINVENTORY = JSON.parse(fs.readFileSync("./petinventory.json", "utf-8"));
    }
}
function getPetInventory() {
    return PETINVENTORY;
}
exports.getPetInventory = getPetInventory;
loadPets();
