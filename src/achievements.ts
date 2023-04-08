import { Message, EmbedBuilder } from 'discord.js';
import fs from 'fs'
import { crv, StatusCode } from './common_to_commands';
import economy from './economy';
import { giveItem } from './shop';
import { UnixTime } from './util';
import { getOpt } from './user-options';
import common from './common';

class Achievement{
    name: string
    description: string
    message?: string
    constructor(name: string, description: string, message?: string){
        this.name = name
        this.description = description
        this.message = message
    }
    earn(id: string, reward: string): CommandReturn{
        let embed = new EmbedBuilder()
        embed.setTitle(`Achievement Get: ${this.name}`)
        embed.setDescription(`reward: ${reward}`)
        return {embeds: [embed], status: StatusCode.ACHIEVEMENT, do_change_cmd_user_expansion: false}
    }

    getReward(){
        return "nothing"
    }
}

class ItemRewardAchievement extends Achievement{
    reward: [string, number]
    constructor(name: string, description: string, itemReward: [string, number], message?: string){
        super(name, description, message)
        this.reward = itemReward
    }

    earn(id: string){
        giveItem(id, this.reward[0], this.reward[1])
        return super.earn(id, `${this.reward[1]} of ${this.reward[0]}`)
    }

    getReward(): string {
        return `${this.reward[1]} of ${this.reward[0]}`
    }
}

class MoneyRewardAchievement extends Achievement{
    reward: string
    constructor(name: string, description: string, reward: string, message?: string){
        super(name, description, message)
        this.reward = reward
    }

    earn(id: string){
        let amount =  economy.calculateAmountFromNetWorth(id, this.reward)
        //hack to make reward include the currency sign
        //must be done after the amount is calculated
        this.reward = `${getOpt(id, "currency-sign", common.GLOBAL_CURRENCY_SIGN)}${this.reward}`
        economy.addMoney(id, amount)
        return super.earn(id, String(amount))
    }

    getReward(): string {
        return `$${this.reward}`
    }
}

type AchievedAchievement = {
    achievement: string,
    achieved: UnixTime
}

const POSSIBLE_ACHIEVEMENTS = { 
    mexico: new MoneyRewardAchievement("mexico", "travel to mexico", "max(2%,100)"),
    canada: new MoneyRewardAchievement("canada", "travel to canada", "max(2%,100)"),
    "united states": new ItemRewardAchievement("united states", "travel to the us", ["gun", 1]),
    france: new MoneyRewardAchievement("france", "travel to france", "max(2%,100)"),
    iraq: new ItemRewardAchievement("iraq", "travel to iraq", ["oil", 30]),
    russia: new ItemRewardAchievement("russia", "travel to russia", ["hammer and sickle", 1]),
    conquerer: new MoneyRewardAchievement("conquerer", "take over russia", "max(200, 5%)"),
    // traveler: new ItemRewardAchievement("traveler", "travel to all countries", ["passport", 193]),
    "even transfer": new ItemRewardAchievement("even transfer", "exchange 50% of your net worth at once", ['tax evasion', 20]),
    "patience": new MoneyRewardAchievement("patience", "get last run after it hasn't been run for 1 day", "max(50%,500)"),
    "impatient": new MoneyRewardAchievement("impatient", "get last run within 1 second of someone else getting it", "max(10%, 100)"),
    "stale bread": new MoneyRewardAchievement("stale bread", "Sniff a stale baguette", "max(1%,50)"),
    "capitalist": new ItemRewardAchievement("capitalist", "Get reset economy", ["capitalism hat", 1]),
    "breaking good": new MoneyRewardAchievement("breaking good", "Create the organic mixture", "max(25%, 250)"),
    "dealer": new ItemRewardAchievement("dealer", "Sell your organic mixture to the cartel", ["cartel's best wishes", 1]),
    "conspiracy theorist": new MoneyRewardAchievement("conspiracy theorist", "Obtain the conspiracy", "max(100%,1000)"),
    "syntax": new ItemRewardAchievement("syntax", "Find a new way to run `the secret command` (ping euro if you did it)", ["syntax", 1])
} as const

let cachedAchievements: undefined | {[id: string]: AchievedAchievement[]};

function getAchievements(){
    if(!cachedAchievements){
        if(fs.existsSync("./data/achievements.json"))
            cachedAchievements = JSON.parse(fs.readFileSync("./data/achievements.json", "utf-8"))
        else cachedAchievements = {}
        return cachedAchievements as {[id: string]: AchievedAchievement[]}
    }
    else if(cachedAchievements){
        return cachedAchievements
    }
    return {}
}

function saveAchievements(){
    fs.writeFileSync('./data/achievements.json', JSON.stringify(cachedAchievements || {}))
}

function getAchievementByName(name: keyof typeof POSSIBLE_ACHIEVEMENTS){
    return POSSIBLE_ACHIEVEMENTS[name]
}

function isAchievement(name: string){
    if(POSSIBLE_ACHIEVEMENTS[name as keyof typeof POSSIBLE_ACHIEVEMENTS]){
        return name as keyof typeof POSSIBLE_ACHIEVEMENTS
    }
    return false
}

type AchievementMessage = CommandReturn

function achievementGet(msgOrId: Message | string, achievement: keyof typeof POSSIBLE_ACHIEVEMENTS): AchievementMessage | false{
    let id = typeof msgOrId === 'string' ? msgOrId : msgOrId.author.id
    if(!cachedAchievements){
        cachedAchievements = getAchievements()
    }
    let achievementObj = getAchievementByName(achievement)
    if(!cachedAchievements[id]){
        cachedAchievements[id] = []
    }
    if(cachedAchievements[id].filter(v => v.achievement === achievement)[0]){
        return false
    }
    if(cachedAchievements[id]){
        cachedAchievements[id].push({
            achievement: achievement,
            achieved: Date.now()
        })
    }
    else {
        cachedAchievements[id] = [{achievement, achieved: Date.now()}]
    }

    saveAchievements()

    return achievementObj.earn(id)
}

function getAchievementsOf(user: string){
    return getAchievements()?.[user]
}

export default{
    getAchievements,
    achievementGet,
    getAchievementsOf,
    POSSIBLE_ACHIEVEMENTS,
    getAchievementByName,
    isAchievement,
    saveAchievements
}
