import fs from 'fs'

type ItemData = {[key: string]: {count: number, uses: number, description: string, max?: number, cost: string[]}}
let INVENTORY: {[key: string]: {[key: string]: number}} = {}
let ITEMS: ItemData = {}

let lottery: {pool: number, numbers: [number, number, number]} = {pool: 0, numbers: [Math.floor(Math.random() * 5 + 1), Math.floor(Math.random() * 5 + 1), Math.floor(Math.random() * 5 + 1)]}


export function loadItems(){
    if(fs.existsSync("./database/inventory.json")){
        let data = fs.readFileSync("./database/inventory.json", "utf-8")
        INVENTORY = JSON.parse(data)
    }
    if(fs.existsSync("./data/shop.json")){
        let data = fs.readFileSync("./data/shop.json", "utf-8")
        ITEMS = JSON.parse(data)
    }
}

export function saveItems(){
    fs.writeFileSync("./database/inventory.json", JSON.stringify(INVENTORY))
}

export function resetItems(){
    INVENTORY = {}
    lottery = {pool: 0, numbers: [Math.floor(Math.random() * 5 + 1), Math.floor(Math.random() * 5 + 1), Math.floor(Math.random() * 5 + 1)]}
    saveItems()
}
export function resetPlayerItems(id: string){
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

export function useItem(user: string, item: string, times?: number){
    if(INVENTORY[user]?.[item]){
        INVENTORY[user][item] -= times ?? 1
        if(INVENTORY[user][item] === 0){
            delete INVENTORY[user][item]
        }
    }
}

export function getInventory(){
    return INVENTORY
}

export function getItems(){
    return ITEMS
}


export default {
    getInventory,
    getItems,
    buyItem,
    saveItems,
    loadItems,
    hasItem,
    useItem,
    resetItems,
    resetPlayerItems,
    giveItem
}
