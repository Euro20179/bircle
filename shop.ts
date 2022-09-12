import fs = require("fs")

type Shopdata = {[key: string]: {items: {[item: string]: number} }}
let INVENTORY: {[key: string]: Shopdata} = {}

let lottery: {pool: number, numbers: [number, number, number]} = {pool: 0, numbers: [Math.floor(Math.random() * 5 + 1), Math.floor(Math.random() * 5 + 1), Math.floor(Math.random() * 5 + 1)]}


export function loadItems(){
    if(fs.existsSync("./inventory.json")){
        let data = fs.readFileSync("./inventory.json", "utf-8")
        ECONOMY = JSON.parse(data)
    }
}
export function saveItems(){
    fs.writeFileSync("./inventory.json", JSON.stringify(INVENTORY))
}

module.exports = {
    INVENTORY: () => INVENTORY
}
