"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveItems = exports.loadItems = void 0;
const fs = require("fs");
let INVENTORY = {};
let lottery = { pool: 0, numbers: [Math.floor(Math.random() * 5 + 1), Math.floor(Math.random() * 5 + 1), Math.floor(Math.random() * 5 + 1)] };
function loadItems() {
    if (fs.existsSync("./inventory.json")) {
        let data = fs.readFileSync("./inventory.json", "utf-8");
        ECONOMY = JSON.parse(data);
    }
}
exports.loadItems = loadItems;
function saveItems() {
    fs.writeFileSync("./inventory.json", JSON.stringify(INVENTORY));
}
exports.saveItems = saveItems;
module.exports = {
    INVENTORY: () => INVENTORY
};
