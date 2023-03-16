"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
let TIMERS = {};
function createTimer(for_user, name) {
    if (!TIMERS[for_user]) {
        TIMERS[for_user] = {};
    }
    if (TIMERS[for_user][name]) {
        return false;
    }
    TIMERS[for_user][name] = Date.now();
    return TIMERS[for_user][name];
}
function timerExists(for_user, name) {
    if (TIMERS[for_user]?.[name] === undefined)
        return false;
    return true;
}
function deleteTimer(for_user, name) {
    if (!TIMERS[for_user]?.[name]) {
        return false;
    }
    delete TIMERS[for_user][name];
    return true;
}
function restartTimer(for_user, name) {
    if (TIMERS[for_user]?.[name]) {
        TIMERS[for_user][name] = Date.now();
    }
}
function createOrRestartTimer(for_user, name) {
    if (!TIMERS[for_user]) {
        TIMERS[for_user] = {};
    }
    TIMERS[for_user][name] = Date.now();
}
function getTimer(for_user, name) {
    return TIMERS[for_user]?.[name];
}
function getTimersOfUser(user) {
    return TIMERS[user];
}
function do_lap(for_user, name) {
    if (TIMERS[for_user]?.[name] === undefined) {
        return false;
    }
    return Date.now() - TIMERS[for_user][name];
}
/**
    * @param {boolean} for_user The user id
* @param {string} name name of timer
* @param {number} x_ms number of ms that have passed
    * @param {boolean} canBeUndef If the tiemr is undefined, should this return true, or false
*/
function has_x_ms_passed(for_user, name, x_ms, canBeUndef = false) {
    if (TIMERS[for_user]?.[name] === undefined) {
        return canBeUndef;
    }
    return (Date.now() - TIMERS[for_user][name]) > x_ms;
}
function has_x_s_passed(for_user, name, x_s, canBeUndef = false) {
    return has_x_ms_passed(for_user, name, x_s * 1000, canBeUndef);
}
function has_x_m_passed(for_user, name, x_m, canBeUndef = false) {
    return has_x_s_passed(for_user, name, x_m * 60, canBeUndef);
}
function saveTimers() {
    fs_1.default.writeFileSync("./timers.json", JSON.stringify(TIMERS));
}
function loadTimers() {
    if (fs_1.default.existsSync("./timers.json")) {
        TIMERS = JSON.parse(fs_1.default.readFileSync('./timers.json', "utf-8"));
    }
    return TIMERS;
}
loadTimers();
exports.default = {
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
};
