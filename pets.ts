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
import economy = require("./economy")

type PetData = {[pet: string]: {description: string, "max-hunger": number, cost: string[], "favorite-food": string}}
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
            total += economy.calculateAmountFromStringIncludingStocks(id, cost)
        }
        economy.loseMoneyToBank(id, total)
        return true
    }
    else{
        PETINVENTORY[id] = {[pet]: PETSHOP[pet]["max-hunger"]}
        let total = 0
        for(let cost of PETSHOP[pet].cost){
            total += economy.calculateAmountFromStringIncludingStocks(id, cost)
        }
        economy.loseMoneyToBank(id, total)
        return true
    }
}

function getUserPets(id: string){
    return PETINVENTORY[id]
}

function hasPet(id: string, pet: string){
    return PETINVENTORY[id]?.[pet]
}

function feedPet(id: string, pet: string, itemName: string){
    if(!PETINVENTORY[id]?.[pet]){
        return false
    }
    let amount
    switch(itemName){
        case "bone": {
            let max = PETSHOP[pet]["max-hunger"]
            amount =  Math.floor(Math.random() * 3 + 2)
            PETINVENTORY[id][pet] += amount
            if(PETINVENTORY[id][pet] > max){
                PETINVENTORY[id][pet] = max
            }
            break
        }
        default:
            return false
    }
    return amount
}

function setActivePet(id: string, pet: string){
    if(PETINVENTORY[id]?.[pet]){
        economy._set_active_pet(id, pet)
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
    if(PETINVENTORY[id]?.[pet]){
        if(getActivePet(id) == pet){
            setActivePet(id, "")
        }
        delete PETINVENTORY[id][pet]
        return true
    }
    return false
}

function damagePet(id: string, pet: string){
    if(PETINVENTORY[id]?.[pet]){
        PETINVENTORY[id][pet] -= Math.floor(Math.random() * 4 + 1)
        if(PETINVENTORY[id][pet] <= 0){
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
        if(Math.random() > .92){
            let rv =  damagePet(id, p)
            if(rv  == 2){
                deaths.push(p)
            }
        }
    }
    return deaths
}

loadPets()

export{
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
    damageUserPetsRandomly
}
