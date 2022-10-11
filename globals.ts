import fs = require("fs")

export const token = fs.readFileSync("./TOKEN", "utf-8").trim()
export const CLIENT_ID = fs.readFileSync("./CLIENT", "utf-8").trim()
export const GUILD_ID = fs.readFileSync("./GUILD", "utf-8").trim()

export let SPAM_ALLOWED = true

export let BUTTONS: { [id: string]: string | (() => string) } = {}
export let POLLS: { [id: string]: { title: string, votes: { [k: string]: string[] } } } = {}
export let SPAMS: { [id: string]: boolean } = {}
export let BLACKJACK_GAMES: { [id: string]: boolean } = {}
export let EDS: { [id: string]: boolean } = {}
