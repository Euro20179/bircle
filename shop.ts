import fs = require("fs")

type ItemData = {[key: string]: {count: number, uses: number, description: string, max?: number}}
let INVENTORY: {[key: string]: {[key: string]: number}} = {}
let ITEMS: ItemData = {}

let lottery: {pool: number, numbers: [number, number, number]} = {pool: 0, numbers: [Math.floor(Math.random() * 5 + 1), Math.floor(Math.random() * 5 + 1), Math.floor(Math.random() * 5 + 1)]}


export function loadItems(){
    if(fs.existsSync("./inventory.json")){
        let data = fs.readFileSync("./inventory.json", "utf-8")
        INVENTORY = JSON.parse(data)
    }
    if(fs.existsSync("./shop.json")){
        let data = fs.readFileSync("./shop.json", "utf-8")
        ITEMS = JSON.parse(data)
    }
}

loadItems()

export function saveItems(){
    fs.writeFileSync("./inventory.json", JSON.stringify(INVENTORY))
}

function resetItems(){
    INVENTORY = {}
    lottery = {pool: 0, numbers: [Math.floor(Math.random() * 5 + 1), Math.floor(Math.random() * 5 + 1), Math.floor(Math.random() * 5 + 1)]}
    saveItems()
}
function resetPlayerItems(id: string){
    if(INVENTORY[id]){
        delete INVENTORY[id]
    }
}

export function hasItem(user: string, item: string){
    if(INVENTORY[user]?.[item]){
        return INVENTORY[user][item]
    }
    return false
}

export function giveItem(user: string,  item: string, count: number){
    if(INVENTORY[user]){
        if(INVENTORY[user][item]){
            INVENTORY[user][item] += count
            return true
        }
        else{
            INVENTORY[user][item] = count
            return true
        }
    }
    else{
        INVENTORY[user] = {[item]: count}
        return true
    }
}

export function buyItem(user: string, item: string, count?: number, forceBuy?: boolean){
    if(INVENTORY[user]){
        if(INVENTORY[user][item]){
            if((INVENTORY[user][item] < (ITEMS[item].max || Infinity)) || forceBuy){
                INVENTORY[user][item] += ITEMS[item].uses * (count ?? 1)
                return true
            }
            return false
        }
        else{
            INVENTORY[user][item] = ITEMS[item].uses * (count ?? 1)
            return true
        }
    }
    else{
        INVENTORY[user] = {[item]: ITEMS[item].uses * (count ?? 1)}
        return false
    }
}

function useItem(user: string, item: string, times?: number){
    if(INVENTORY[user]?.[item]){
        INVENTORY[user][item] -= times ?? 1
        if(INVENTORY[user][item] === 0){
            delete INVENTORY[user][item]
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
    useItem,
    resetItems,
    resetPlayerItems,
    giveItem
}
