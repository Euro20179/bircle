const fs = require("fs")

let ECONOMY: {[key: string]: {money: number, lastTalk: number}} = {}

function loadEconomy(){
    if(fs.existsSync("./economy.json")){
        let data = fs.readFileSync("./economy.json")
        ECONOMY = JSON.parse(data)
    }
}
function saveEconomy(){
    fs.writeFileSync("./economy.json", JSON.stringify(ECONOMY))
}

function createPlayer(id: string){
    ECONOMY[id] = {money: 0, lastTalk: 0}
}

function addMoney(id: string, amount: number){
    if(ECONOMY[id]){
        ECONOMY[id].money += amount
    }
}

function earnMoney(id: string){
    ECONOMY[id].lastTalk = Date.now()
    if(ECONOMY[id].money == 0){
        ECONOMY[id].money = 100
    }
    else{
        ECONOMY[id].money *= 1.001
    }
}

function canEarn(id: string){
    if(!ECONOMY[id])
        return false
    let secondsDiff = (Date.now() - ECONOMY[id].lastTalk) / 1000
    if(secondsDiff > 60){
        return true
    }
    return false
}

function canBetAmount(id: string, amount: number){
    if(ECONOMY[id] && amount <= ECONOMY[id].money){
        return true
    }
    return false
}

loadEconomy()


module.exports = {
    ECONOMY: ECONOMY,
    loadEconomy: loadEconomy,
    saveEconomy: saveEconomy,
    createPlayer: createPlayer,
    earnMoney: earnMoney,
    canEarn: canEarn,
    addMoney: addMoney,
    canBetAmount: canBetAmount
}
