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

function canEarn(id: string){
}

loadEconomy()


module.exports = {
    ECONOMY: ECONOMY,
    loadEconomy: loadEconomy,
    saveEconomy: saveEconomy,
    createPlayer: createPlayer
}
