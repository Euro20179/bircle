//TODO: add pets, and pet shop
//you have to keep your pet alive by feeding it
//each pet has an ability
//looses hunger slowly, food will be cheap
//nothing happens on death, just must be bought again
//eg: cat, gain .3% from talking instead of .1%
//eg: tiger, get taxed from .1 - .6% instead of .1 - .8%
//eg: dog, every 60 seconds, there is a 1% chance to dig up a treasure
//you can own as many pets as you like, you just must keep them alive, but you can only have one active at a time

import fs = require("fs")

const {loseMoneyToBank, calculateAmountFromString} = require("./economy.js")

type PetData = {[pet: string]: {description: string, "max-hunger": number, cost: string[]}}
type UserPetData = {[pet: string]: number}
let PETSHOP: PetData = {}
let PETINVENTORY: {[id: string]: UserPetData} = {}

function loadPets(){
    if(fs.existsSync("./pets.json")){
        PETSHOP = JSON.parse(fs.readFileSync("./pets.json", "utf-8"))
    }
    if(fs.existsSync("./petinventory.json")){
        PETINVENTORY = JSON.parse(fs.readFileSync("./petinventory.json", "utf-8"))
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
        PETINVENTORY[id][pet] = PETSHOP[pet]["max-hunger"]
        let total = 0
        for(let cost of PETSHOP[pet].cost){
            total += calculateAmountFromString(id, cost)
        }
        loseMoneyToBank(id, total)
    }
    return true
}

function hasPet(id: string, pet: string){
    return PETINVENTORY[id]?.[pet]
}

function feedPet(id: string, pet: string, itemName: string){
    if(!PETINVENTORY[id]?.[pet]){
        return false
    }
    switch(itemName){
        case "bone": {
            let max = PETSHOP[pet]["max-hunger"]
            let amount =  Math.floor(Math.random() * 3 + 2)
            PETINVENTORY[id][pet] += amount
            if(PETINVENTORY[id][pet] > max){
                PETINVENTORY[id][pet] = max
            }
            break
        }
        default:
            return false
    }
    return true
}

loadPets()

export{
    getPetInventory,
    getPetShop,
    buyPet,
    hasPet,
    feedPet,
    savePetData
}
