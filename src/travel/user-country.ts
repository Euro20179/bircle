import fs from 'fs'

export type UserCountryActivity = {cost: string, run: string}

export interface IUserCountry{
    cost: string,
    activities: {[name: string]: UserCountryActivity}
}

function getUserCountries(){
    let data: { [key: string]: { [name: string]: IUserCountry } } = {}
    if(fs.existsSync("./data/travel.json")){
        data = JSON.parse(fs.readFileSync("./data/travel.json", "utf-8"))
    }
    return data
}

function addCountry(userId: string, name: string, cost: string, activities: {[name: string]: UserCountryActivity}){
    let data: { [key: string]: { [name: string]: IUserCountry } } = {}
    if(fs.existsSync("./data/travel.json")){
        data = JSON.parse(fs.readFileSync("./data/travel.json", "utf-8"))
    }
    if(data[userId]){
        data[userId][name] = {cost, activities}
    }
    else{
        data[userId] = {[name]: {cost, activities}}
    }
    fs.writeFileSync("./data/travel.json", JSON.stringify(data))
}

function removeCountry(userId: string, name: string){
    let data: { [key: string]: { [name: string]: IUserCountry } } = {}
    if(fs.existsSync("./data/travel.json")){
        data = JSON.parse(fs.readFileSync("./data/travel.json", "utf-8"))
    }
    if(data[userId]?.[name]){
        delete data[userId][name]
        fs.writeFileSync("./data/travel.json", JSON.stringify(data))
        return true
    }
    return false
}

export default{
    addCountry,
    removeCountry,
    getUserCountries
}
