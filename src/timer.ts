import fs from 'fs'

let TIMERS: {[id: string]: {[name: string]: number}} = {}

function createTimer(for_user: string, name: string){
    if(!TIMERS[for_user]){
        TIMERS[for_user] = {}
    }
    if(TIMERS[for_user][name]){
        return false
    }
    TIMERS[for_user][name] = Date.now()
    return TIMERS[for_user][name]
}

function timerExists(for_user: string, name: string){
    if(TIMERS[for_user]?.[name] === undefined)
        return false
    return true;
}

function deleteTimer(for_user: string, name: string){
    if(!TIMERS[for_user]?.[name]){
        return false
    }
    delete TIMERS[for_user][name]
    return true
}

function restartTimer(for_user: string, name: string){
    if(TIMERS[for_user]?.[name]){
        TIMERS[for_user][name] = Date.now()
    }
}

function createOrRestartTimer(for_user: string, name: string){
    if(!TIMERS[for_user]){
        TIMERS[for_user] = {}
    }
    TIMERS[for_user][name] = Date.now()
}

function getTimer(for_user: string, name: string){
    return TIMERS[for_user]?.[name]
}

function getTimersOfUser(user: string){
    return TIMERS[user]
}

type LapUnit = "ms" | "s" | "m" | "d" | "h"

function do_lap(for_user: string, name: string, unit: LapUnit = "ms"){
    if(TIMERS[for_user]?.[name] === undefined){
        return false
    }
    let ms =  Date.now() - TIMERS[for_user][name]
    switch(unit){
        case "s": 
            return ms / 1000
        case "m":
            return ms / 1000 / 60
        case "ms":
            return ms
        case "d":
            return ms / 1000 / 60 / 60 / 24
        case "h":
            return ms / 1000 / 60 / 60
        default:
            return ms
    }
}

type milliseconds_t = Tagger<number>
type seconds_t = Tagger<number>
type minutes_t = Tagger<number>

/**
    * @param {boolean} for_user The user id
* @param {string} name name of timer
* @param {number} x_ms number of ms that have passed
    * @param {boolean} canBeUndef If the tiemr is undefined, should this return true, or false
*/
function has_x_ms_passed(for_user: string , name: string, x_ms: milliseconds_t, canBeUndef = false){
    if(TIMERS[for_user]?.[name] === undefined){
        return canBeUndef
    }
    return (Date.now() - TIMERS[for_user][name]) > x_ms
}

function has_x_s_passed(for_user: string, name: string, x_s: seconds_t, canBeUndef = false){
    return has_x_ms_passed(for_user, name, x_s * 1000, canBeUndef)
}

function has_x_m_passed(for_user: string, name: string, x_m: minutes_t, canBeUndef = false){
    return has_x_s_passed(for_user, name, x_m * 60, canBeUndef)
}

function saveTimers(){
    fs.writeFileSync("./timers.json", JSON.stringify(TIMERS))
}

function loadTimers(){
    if(fs.existsSync("./timers.json")){
        TIMERS = JSON.parse(fs.readFileSync('./timers.json', "utf-8"))
    }
    return TIMERS
}

loadTimers()

export default{
    createTimer,
    deleteTimer,
    do_lap,
    has_x_ms_passed,
    has_x_s_passed,
    has_x_m_passed,
    saveTimers,
    loadTimers,
    getTimer,
    getTimersOfUser,
    restartTimer,
    timerExists,
    createOrRestartTimer
}
