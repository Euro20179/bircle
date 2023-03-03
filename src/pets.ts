//TODO: add pets, and pet shop
//you have to keep your pet alive by feeding it
//each pet has an ability
//looses hunger slowly, food will be cheap
//nothing happens on death, just must be bought again
//eg: cat, gain .3% from talking instead of .1%
//eg: tiger, get taxed from .1 - .6% instead of .1 - .8%
//eg: dog, every 60 seconds, there is a 1% chance to dig up a treasure
//you can own as many pets as you like, you just must keep them alive, but you can only have one active at a time
//

import { Message } from 'discord.js'

import fs = require("fs")
import economy = require("./economy")

const { buyItem } = require("./shop.js")

type PetData = {[pet: string]: {description: string, "max-hunger": number, cost: string[], "favorite-food": string}}
type UserPetData = {[pet: string]: {health: number, name: string}}
let PETSHOP: PetData = {}
let PETINVENTORY: {[id: string]: UserPetData} = {}

let PETACTIONS: {[key: string]: Function} = {
    cat: () => {
        return .003 //increases chat bonus by .003%
    },
    puffle: async(m: Message) => {
        let stuff: {money: number, items: string[]} = {money: 0, items: []}
        if(Math.random() <= .01){ // 1% chance
            if(Math.random() >= .30){ //70% for money
                let amount = economy.calculateAmountFromStringIncludingStocks(m.author.id, `${1 + (Math.random() * (0.02) +  0.01)}%`)
                economy.addMoney(m.author.id, amount)
                stuff.money = amount
            }
            else{ //30% for items
                for(let i = 0; i < 2; i++){
                    let items = fs.readFileSync("./data/shop.json", "utf-8")
                    let itemJ = JSON.parse(items)
                    let itemNames = Object.keys(itemJ)
                    let randItemName = itemNames[Math.floor(Math.random()  * itemNames.length)]
                    if(itemJ[randItemName]['puffle-banned']){
                        i--;
                        continue
                    }
                    buyItem(m.author.id,  randItemName, undefined, true)
                    stuff.items.push(randItemName)
                }
            }
            return stuff
        }
        return false
    },
    tiger: () => randInt(-.003, .006),
    dog: (start?: number) => (start ?? 0) + 50,
    bird: (amount: number) => amount * 2
}

function randInt(min: number, max: number){
    return Math.random()  * (max - min) + min
}

function loadPets(){
    if(fs.existsSync("./data/pets.json")){
        PETSHOP = JSON.parse(fs.readFileSync("./data/pets.json", "utf-8"))
    }
    if(fs.existsSync("./petinventory.json")){
        PETINVENTORY = JSON.parse(fs.readFileSync("./petinventory.json", "utf-8"))
        for(let user in PETINVENTORY){
            for(let ph of Object.entries(PETINVENTORY[user])){
                let [pet, data] = ph
                if(typeof data === 'number'){
                    PETINVENTORY[user][pet] = {health: data, name: pet}
                }
            }
        }
    }
}

function savePetData(){
    fs.writeFileSync("./petinventory.json", JSON.stringify(PETINVENTORY))
}

function getPetInventory(){
    return PETINVENTORY
}

function getPetShop(){
    return PETSHOP
}

function buyPet(id: string, pet: string){
    if(PETINVENTORY[id]){
        if(PETINVENTORY[id][pet]){
            return false;
        }
        PETINVENTORY[id][pet] = {health: PETSHOP[pet]["max-hunger"], name: pet}
        let total = 0
        for (let cost of PETSHOP[pet].cost) {
            total += economy.calculateAmountOfMoneyFromString(id, economy.playerLooseNetWorth(id), cost)
        }
        economy.loseMoneyToBank(id, total)
        return true
    }
    else{
        PETINVENTORY[id] = {[pet]: {health: PETSHOP[pet]["max-hunger"], name: pet}}
        let total = 0
        for (let cost of PETSHOP[pet].cost) {
            total += economy.calculateAmountOfMoneyFromString(id, economy.playerLooseNetWorth(id), cost)
        }
        economy.loseMoneyToBank(id, total)
        return true
    }
}

function getUserPets(id: string){
    return PETINVENTORY[id]
}

function hasPet(id: string, pet: string){
    return PETINVENTORY[id]?.[pet.toLowerCase()]
}

function hasPetByName(id: string, pet: string){
    return Object.entries(PETINVENTORY[id]).filter(v => v[1].name === pet)[0]
}

function hasPetByNameOrType(id: string, pet: string): [string, {health: number, name: string}]{
    let namedPet = hasPetByName(id, pet)
    if(!namedPet){
        return [pet, hasPet(id, pet)]
    }
    return namedPet
}

function getFavoriteFoodOfPetType(pet: string){
    return PETSHOP[pet]?.['favorite-food']
}

function feedPet(id: string, pet: string, itemName: string){
    if(!PETINVENTORY[id]?.[pet]){
        return false
    }
    let amount
    let max = PETSHOP[pet]["max-hunger"]
    switch(itemName){
        case "bone": {
            amount =  Math.floor(Math.random() * 4 + 3)
            break
        }
        case "fish": {
            amount = Math.floor(Math.random() * 6 + 3)
            break
        }
        case "seal": {
            amount = Math.floor(Math.random() * 7 + 4)
            break
        }
        default:
            return false
    }
    let favoriteFood = getFavoriteFoodOfPetType(pet)
    if(itemName === favoriteFood){
        amount *= 2
    }
    PETINVENTORY[id][pet].health += amount
    if(PETINVENTORY[id][pet].health > max){
        PETINVENTORY[id][pet].health = max
    }
    return amount
}

function getPetTypeByName(id: string, name: string){
    if(PETINVENTORY[id]){
        for(let pet in PETINVENTORY[id]){
            if(PETINVENTORY[id][pet].name === name){
                return pet
            }
        }
        if(PETINVENTORY[id]?.[name.toLowerCase()]){
            return name.toLowerCase()
        }
    }
    return null
}

function setActivePet(id: string, pet: string){
    if(!pet)
        economy._set_active_pet(id, "")
    if(PETINVENTORY[id]?.[pet]){
        economy._set_active_pet(id, pet)
        return true
    }
    let pType = getPetTypeByName(id, pet)
    if(pType && PETINVENTORY[id]?.[pType]){
        economy._set_active_pet(id, pType)
        return true
    }
    return false
}

function getActivePet(id: string){
    let activePet = economy._get_active_pet(id)
    if(activePet)
        return activePet
    return false
}

function  killPet(id: string, pet: string){
    if(PETINVENTORY[id]?.[pet] !== undefined){
        if(getActivePet(id) == pet){
            setActivePet(id, "")
        }
        delete PETINVENTORY[id][pet]
        return true
    }
    return false
}

function damagePet(id: string, pet: string){
    if(PETINVENTORY[id]?.[pet] !== undefined){
        PETINVENTORY[id][pet].health -= Math.floor(Math.random() * 4 + 1)
        if(PETINVENTORY[id][pet].health <= 0){
            killPet(id, pet)
            return 2
        }
        return 1
    }
    return 0
}

function damageUserPetsRandomly(id:  string){
    let deaths = []
    for(let p in getUserPets(id)){
        if(Math.random() > .95){
            let rv =  damagePet(id, p)
            if(rv  == 2){
                deaths.push(p)
            }
        }
    }
    return deaths
}

function namePet(id: string, pet: string, name: string){
    if(PETINVENTORY[id]?.[pet]){
        PETINVENTORY[id][pet].name = name
        return true
    }
    return false
}

loadPets()

export default{
    getPetInventory,
    getPetShop,
    buyPet,
    hasPet,
    feedPet,
    savePetData,
    setActivePet,
    getActivePet,
    getUserPets,
    damagePet,
    damageUserPetsRandomly,
    hasPetByName,
    PETACTIONS,
    getPetTypeByName,
    namePet,
    hasPetByNameOrType,
    getFavoriteFoodOfPetType
}
