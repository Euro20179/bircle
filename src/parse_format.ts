import { Interpreter } from "./common_to_commands";
import { strToTT, T, Token, format } from "./parsing";
import { getContentFromResult, isMsgChannel } from "./util";

import htmlRenderer from "./html-renderer";

import economy from './economy'
import timer from "./timer";
import { ChannelType } from "discord.js";

export default {
    ["parse_%"]: async (_token, _char, args, int) => {
        let data = int.getPipeData()
        if (data) {
            if (!args.length)
                return getContentFromResult(int.getPipeData() as CommandReturn)
            else if (args[0] === "?")
                return data.status
            else if (args[0] === "raw")
                return JSON.stringify(data)
            else {
                return `{%|${args.join("|")}}`
            }
        }
        else {
            return "{%}"
        }
    },

    parse_cmd: async (_, __, ___, int) => {
        return int.args[0]
    },

    parse_fhex: async (_, __, args) => {
        let [num, base] = args
        return String(parseInt(num, parseInt(base) || 16))
    },
    parse_fbase: async function(_, __, ___, ____) { return this["parse_fhex"](_, __, ___, ____) },

    parse_token: async (token, __, args, int) => {
        let [tt, ...data] = args
        let text = data.join("|")
        return int.interpretAsToken(new Token(strToTT(tt), text, token.argNo as number), strToTT(tt))
    },

    parse_rev: async (_, __, args) => {
        if (args.length > 1)
            return args.reverse().join(" ")
        return [...args.join(" ")].reverse().join("")
    },
    parse_reverse: async function(token, char, args, int) { return this.parse_rev(token, char, args, int) },

    ["parse_$"]: async (_, __, args, int) => String(economy.calculateAmountFromString(int.getMessage().author.id, args.join(" ") || "100%")),

    ["parse_$l"]: async (_, __, args, int) => String(economy.calculateLoanAmountFromString(int.getMessage().author.id, args.join(" ") || "100%")),

    ["parse_$t"]: async (_, __, args, int) => String(economy.calculateAmountFromStringIncludingStocks(int.getMessage().author.id, args.join(" ") || "100%")),

    ["parse_$n"]: async (_, __, args, int) => String(economy.calculateAmountFromStringIncludingStocks(int.getMessage().author.id, args.join(" ") || "100%") - economy.calculateLoanAmountFromString(int.getMessage().author.id, "100%")),

    parse_timer: async (_, __, args, int) => {
        let name = args.join(" ").trim()
        if (name[0] === '-') {
            return String(timer.do_lap(int.getMessage().author.id, name.slice(1)))
        }
        return String(timer.getTimer(int.getMessage().author.id, args.join(" ").trim()))
    },

    parse_user: async (__, _, args, int) => {
        let fmt = args.join(" ") || "<@%i>"
        let member = int.getMessage().member
        let user = member?.user || int.getMessage().author
        if (user === undefined && member === undefined && member === null) {
            return `{${args.join(" ")}}`
        }
        return format(fmt,
            {
                i: user.id || "#!N/A",
                u: user.username || "#!N/A",
                n: member?.displayName || "#!N/A",
                X: () => member?.displayHexColor.toString() || "#!N/A",
                x: () => member?.displayColor.toString() || "#!N/A",
                c: user.createdAt?.toString() || "#!N/A",
                j: member?.joinedAt?.toString() || "#!N/A",
                b: member?.premiumSince?.toString() || "#!N/A",
                a: () => user?.avatarURL() || "#N/A"
            }
        )
    },

    parse_rand: async (_, __, args) => {
        if (args && args?.length > 0)
            return args[Math.floor(Math.random() * args.length)]
        return "{rand}"
    },

    parse_num: async (_, __, args) => {
        if (!args || args.length < 1)
            return String(Math.random())
        let low = Number(args[0])
        let high = Number(args[1]) || low * 10
        let dec = ["y", "yes", "true", "t", "."].indexOf(args[2]) > -1 ? true : false
        if (dec)
            return String((Math.random() * (high - low)) + low)
        return String(Math.floor((Math.random() * (high - low)) + low))
    },
    parse_number: async function(token, char, args, int) { return this.parse_num(token, char, args, int) },

    parse_ruser: async (_, __, args, int) => {
        let fmt = args.join(" ") || "%u"
        let guild = int.getMessage().guild
        if (guild === null) {
            return `{${fmt}}`
        }

        let member = guild.members.cache.random()
        if (member === undefined)
            member = (await guild.members.fetch()).random()
        if (member === undefined) {
            return `{${fmt}}`
        }
        let user = member.user
        return format(fmt,
            {
                i: user.id || "#!N/A",
                u: user.username || "#!N/A",
                n: member.displayName || "#!N/A",
                X: () => member?.displayHexColor.toString() || "#!N/A",
                x: () => member?.displayColor.toString() || "#!N/A",
                c: user.createdAt.toString() || "#!N/A",
                j: member.joinedAt?.toString() || "#!N/A",
                b: member.premiumSince?.toString() || "#!N/A"
            }
        )
    },

    parse_html: async (_, __, args) => htmlRenderer.renderHTML(args.join("|")),

    parse_time: async (_, __, args) => {
        let date = new Date()
        if (!args.length) {
            return date.toString()
        }
        let hours = date.getHours()
        let AMPM = hours < 12 ? "AM" : "PM"
        if (args[0].trim() == '12') {
            hours > 12 ? hours = hours - 12 : hours
            args.splice(0, 1)
        }
        return format(args.join("|"), {
            "d": `${date.getDate()}`,
            "H": `${hours}`,
            "M": `${date.getMinutes()}`,
            "S": `${date.getSeconds()}`,
            "T": `${hours}:${date.getMinutes()}:${date.getSeconds()}`,
            "t": `${hours}:${date.getMinutes()}`,
            "1": `${date.getMilliseconds()}`,
            "z": `${date.getTimezoneOffset()}`,
            "x": AMPM,
            "D": `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`,
            "m": `${date.getMonth() + 1}`,
            "Y": `${date.getFullYear()}`,
            "w": `${date.getDay()}`,
            "s": `${Date.now()}`
        })
    },

    parse_arg: async (_, __, ___, int) => int.args[int.args.length - 1],

    parse_channel: async (_, __, args, int) => {
        return format(args.join("|"), {
            "i": `${int.getMessage().channel.id}`,
            "N!": `${(() => {
                let ch = int.getMessage().channel
                if (ch.type === ChannelType.GuildText)
                    return ch.nsfw
                return "IsNotText"
            })()}`,
            "n": `${(() => {
                let ch = int.getMessage().channel
                if (ch.type !== ChannelType.DM)
                    return ch.name
                return "IsDM"
            })()}`,
            "c": `${int.getMessage().channel.createdAt}`
        })

    }

} as { [key: string]: (token: Token, char: string, args: string[], interpreter: Interpreter) => Promise<string | Token[]> }
