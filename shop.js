"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buyItem = exports.saveItems = exports.loadItems = void 0;
const fs = require("fs");
let INVENTORY = {};
let ITEMS = {};
let lottery = { pool: 0, numbers: [Math.floor(Math.random() * 5 + 1), Math.floor(Math.random() * 5 + 1), Math.floor(Math.random() * 5 + 1)] };
function loadItems() {
    if (fs.existsSync("./inventory.json")) {
        let data = fs.readFileSync("./inventory.json", "utf-8");
        INVENTORY = JSON.parse(data);
    }
    if (fs.existsSync("./shop.json")) {
        let data = fs.readFileSync("./shop.json", "utf-8");
        ITEMS = JSON.parse(data);
    }
}
exports.loadItems = loadItems;
loadItems();
function saveItems() {
    fs.writeFileSync("./inventory.json", JSON.stringify(INVENTORY));
}
exports.saveItems = saveItems;
function hasItem(user, item) {
    if (INVENTORY[user]?.[item]) {
        return true;
    }
    return false;
}
function buyItem(user, item, count) {
    if (INVENTORY[user]) {
        if (INVENTORY[user][item]) {
            INVENTORY[user][item] += ITEMS[item].uses * (count ?? 1);
        }
        else {
            INVENTORY[user][item] = ITEMS[item].uses * (count ?? 1);
        }
    }
    else {
        INVENTORY[user] = { [item]: ITEMS[item].uses * (count ?? 1) };
    }
}
exports.buyItem = buyItem;
function useItem(user, item, times) {
    if (INVENTORY[user]?.[item]) {
        INVENTORY[user][item] -= times ?? 1;
        if (INVENTORY[user][item] === 0) {
            delete INVENTORY[user][item];
        }
    }
}
module.exports = {
    INVENTORY: () => INVENTORY,
    ITEMS: () => ITEMS,
    buyItem,
    saveItems,
    loadItems,
    hasItem,
    useItem
};
