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
function deleteTimer(for_user, name) {
    if (!TIMERS[for_user]?.[name]) {
        return false;
    }
    delete TIMERS[for_user][name];
    return true;
}
function getTimer(for_user, name) {
    return TIMERS[for_user]?.[name];
}
function getTimersOfUser(user) {
    return TIMERS[user];
}
function do_lap(for_user, name) {
    if (!TIMERS[for_user]?.[name]) {
        return false;
    }
    return Date.now() - TIMERS[for_user][name];
}
function has_x_ms_passed(for_user, name, x_ms) {
    if (!TIMERS[for_user]?.[name]) {
        return false;
    }
    return (Date.now() - TIMERS[for_user][name]) > x_ms;
}
function has_x_s_passed(for_user, name, x_s) {
    return has_x_ms_passed(for_user, name, x_s * 1000);
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
    saveTimers,
    loadTimers,
    getTimer,
    getTimersOfUser
};
