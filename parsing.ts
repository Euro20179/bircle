import { Message } from "discord.js"

const { getOpt } = require("./user-options")
const {prefix, vars, getVar} = require('./common.js')
const {format, safeEval, getOpts, generateSafeEvalContextFromMessage, parseBracketPair} = require('./util.js')
const  economy = require('./economy.js')
const timer = require("./timer.js")

async function buildFormat(sequence: string, msg: Message, curArg: string, customFormats: any){
    let args
    [sequence, ...args] = sequence.split("|")
    for(let format in customFormats){
        if(sequence == format){
            return customFormats[format](sequence, msg, curArg, args)
        }
    }
    switch(sequence){
	case "cmd":
	    return msg.content.split(" ")[0].slice(getOpt(msg.author.id, "prefix", prefix).length)
	case "fhex":
	case "fbase":{
	    let [num, base] = args
	    return parseInt(num, parseInt(base) || 16)
	}
	case "hex":
	case "base":{
	    let [num, base] = args
	    return Number(num).toString(parseInt(base) || 16)
	}
	case "rev":
	case "reverse":
	    if(args.length > 1)
		return args.reverse().join(" ")
	    return [...args.join(" ")].reverse().join("")
	case 'c':
	    return msg.content.split(" ").slice(1).join(" ").trim()
    case "channel": {
        let fmt = args.join(" ") || "<#%i>"
        let channel = msg.channel
        //@ts-ignore
        return format(fmt, { i: channel.id, n: channel.name ?? `{${channel.type}}`})
    }
    case '$': {
        return economy.calculateAmountFromString(msg.author.id, args.join(" ") || "100%")
    }
    case '$l': {
        return economy.calculateLoanAmountFromString(msg.author.id, args.join(" ") || "100%")
    }
    case '$t': {
        return economy.calculateAmountFromStringIncludingStocks(msg.author.id, args.join(" ") || "100%")
    }
    case '$n': {
        return economy.calculateAmountFromStringIncludingStocks(msg.author.id, args.join(" ") || "100%") - economy.calculateLoanAmountFromString(msg.author.id, "100%")
    }
    case "timer": {
        let name = args.join(" ").trim()
        if(name[0] === '-'){
            return String(timer.default.do_lap(msg.author.id, name.slice(1)))
        }
        return String(timer.default.getTimer(msg.author.id, args.join(" ").trim()))
    }
    case "user":{
        let fmt = args.join(" ") || "<@%i>"
        let member = msg.member
        let user = member?.user
        if(user === undefined || member === undefined || member ===  null){
            return `{${args.join(" ")}}`
        }
        return format(fmt,
            {
                i: user.id || "#!N/A",
                u: user.username || "#!N/A",
                n: member.nickname || "#!N/A",
                X: member.displayHexColor.toString() || "#!N/A",
                x: member.displayColor.toString() || "#!N/A",
                c: user.createdAt.toString() || "#!N/A",
                j: member.joinedAt?.toString() || "#!N/A",
                b: member.premiumSince?.toString() || "#!N/A",
                a:  member.user.avatarURL() || "#N/A"
            }
        )
    }
    case "rand":
        if(args && args?.length > 0)
            return args[Math.floor(Math.random() * args.length)]
        return "{rand}"
    case "num":
    case "number":
        if(args && args?.length > 0){
            let low = Number(args[0])
            let high = Number(args[1]) || low * 10
            let dec = ["y", "yes", "true", "t", "."].indexOf(args[2]) > -1 ? true : false
            if(dec)
                return String((Math.random() * (high - low)) + low)
            return String(Math.floor((Math.random() * (high - low)) + low))
        }
        return String(Math.random())
    case "ruser":
        let fmt = args.join(" ") || "%u"
        let guild = msg.guild
        if(guild  === null){
            return `{${fmt}}`
        }

        let member = guild.members.cache.random()
        if(member === undefined)
            member = (await guild.members.fetch()).random()
        if(member === undefined){
            return `{${fmt}}`
        }
        let user = member.user
        return format(fmt,
                {
                    i: user.id || "#!N/A",
                    u: user.username || "#!N/A",
                    n: member.nickname || "#!N/A",
                    X: member.displayHexColor.toString() || "#!N/A",
                    x: member.displayColor.toString() || "#!N/A",
                    c: user.createdAt.toString() || "#!N/A",
                    j: member.joinedAt?.toString() || "#!N/A",
                    b: member.premiumSince?.toString() || "#!N/A"
                }
            )
    case "time":
            let date = new Date()
            if(!args.length){
                return date.toString()
            }
            let hours = date.getHours()
            let AMPM = hours < 12 ? "AM" : "PM"
            if(args[0].trim() == '12'){
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
                "w": `${date.getDay()}`
            })
    case "arg":
        return curArg
	case "channel":
	    return format(args.join("|"), {
		"i": `${msg.channel.id}`,
        //@ts-ignore
		"N!": `${msg.channel.nsfw}`,
        //@ts-ignore
		"n": `${msg.channel.name}`,
		"c": `${msg.channel.createdAt}`
	    })


    }
    if(args.length > 0){
        return `{${sequence}|${args.join("|")}}`
    }
    return `{${sequence}}`
}

async function buildEscape(letter: string, sequence: string, msg: Message, curArg: string){
    switch(letter){
        case "n":
            return "\n";
        case "t":
            return "\t"
        case "U":
        case "u":
            if(!sequence){
                return "\\u"
            }
            try{
                return String.fromCodePoint(parseInt(`0x${sequence}`))
            }
            catch(err){
                return `\\u{${sequence}}`
            }
        case "s":
            if(sequence){
                return sequence
            }
            return " "
        case "b":
            return `**${sequence}**`
        case "i":
            return `*${sequence}*`
        case "S":
            return `~~${sequence}~~`
        case "d":
            let date = new Date(sequence)
            if(date.toString() === "Invalid Date"){
                if(sequence){
                    return `\\d{${sequence}}`
                }
                else{
                    return `\\d`
                }
            }
            return date.toString()
        case "D":
            if(isNaN(parseInt(sequence))){
                if(sequence){
                    return `\\D{${sequence}}`
                }
                return `\\D`
            }
            return (new Date(parseInt(sequence))).toString()
        case "T":{
            let ts = Date.now()
            console.log(ts, sequence, parseFloat(sequence))
            if(parseFloat(sequence)){
                return String(ts / parseFloat(sequence))
            }
            return String(Date.now())
        }
        case "V": {
            let [scope, ...name] = sequence.split(":")
            //@ts-ignore
            name = name.join(":")
            if(scope == "%"){
                scope = msg.author.id
            }
            else if(scope == "."){
                let v = getVar(msg, name)
                if(v !== false)
                    return v
                else return `\\V{${sequence}}`
            }
            else if(!name){
                //@ts-ignore
                name = scope
                let v = getVar(msg, name)
                if(v !== false)
                    return v
                return `\\V{${sequence}}`
            }
            let v = getVar(msg, name, scope)
            if(v !== false)
                return v
            else return `\\V{${sequence}}`
        }
        case "v":
            let num = Number(sequence)
            //basically checks if it's a n
            if(!isNaN(num)){
                let args = msg.content.split(" ")
                return String(args[num])
            }
            let v = getVar(msg, sequence, msg.author.id)
            if(v === false)
                v = getVar(msg, sequence)
            if(v !== false)
                return v
            else return `\\v{${sequence}}`
        case "\\":
            return "\\"
        default:
            if(sequence){
                return `${letter}{${sequence}}`
            }
            return `${letter}`
    }
}

function getCommand(content: string){
    return content.split(" ")[0]
}

async function parseCmd({msg, content, command, customEscapes, customFormats}: {msg: Message, content: string, command: string, customEscapes: any, customFormats: any}){
    if(!content) content = msg.content
    if(!command){
        command = getCommand(content.slice(getOpt(msg.author.id, "prefix", prefix).length))
        content = content.slice(command.length + getOpt(msg.author.id, "prefix", prefix).length)
    }
    let args = []
    //it should be smth like: {3: "$(...)"}, where 3 represents the argNo
    let doFirsts: {[key: number]: string} = {}
    let curArg = ""
    for(let i =0 ; i < content.length; i++){
        let ch = content[i]
        switch(ch){
            case " ":
                if(curArg !== ""){
                    args.push(curArg)
                    curArg = ""
                }
                break;
            case "$":
                let argNo = args.length;
                //The user can specify a spot where they want to replace it, if they do, don't add another
                i++
                ch = content[i]
                if(ch === '['){
                    if(curArg.indexOf("%{}") === -1) curArg += "%{}"
                    let inside = parseBracketPair(content, "[]", ++i)
                    i += inside.length

                    curArg = curArg.replaceAll(/(?<!\\)%\{\}/g, String(safeEval(inside, {...generateSafeEvalContextFromMessage(msg), curArg: curArg, ...vars["__global__"]}, {timeout: 1000})))
                }
                else if(ch === "("){
                    if(!curArg.match(/(%\{\d*\}|%\{-1\})/g)) curArg += "%{}"

                    let inside = getOpt(msg.author.id, "prefix", prefix)

                    inside += parseBracketPair(content, "()", ++i)

                    i += inside.length

                    doFirsts[argNo] = inside
                }
                else if(ch == ' '){
                    curArg += "$"
                    if(curArg !== ""){
                        args.push(curArg)
                        curArg = ""
                    }
                }
                else{
                    curArg += "$"
                    if(ch)
                        curArg += ch
                }
                break;
            case "\\":{
                i++
                ch = content[i]
                if(ch === undefined){
                    curArg += "\\"
                    break
                }
                let prefixLetter = ch
                i++
                ch = content[i]
                let sequence = parseBracketPair(content, "{}", ++i)
                i += sequence.length
                curArg += await buildEscape(prefixLetter, sequence, msg, curArg)
                break;
            }
            case "{":
                let value = parseBracketPair(content, "{}", ++i)
                i += value.length
                curArg += await buildFormat(value, msg, curArg, customFormats)
                break;
            default:
                curArg += ch
                break;
        }
    }
    if(curArg){
        args.push(curArg)
    }
    return [command, args, doFirsts]
}

function parseAliasReplacement(msg: Message, cmdContent: string, args: string[]){
    let finalText = ""
    let isEscaped = false
    for(let i = 0; i < cmdContent.length; i++){
        let ch = cmdContent[i]
        switch(ch){
            case "\\": {
                isEscaped = true
                break
            }
            case "{": {
                let startingI = i
                if(isEscaped){
                    isEscaped = false
                    finalText += "{"
                    continue
                }
                let val = ""
                for(i++; i < cmdContent.length; i++){
                    let ch = cmdContent[i]
                    if(!"abcdefghijklmnopqrstuvwxyz".includes(ch)){
                        i--
                        break
                    }
                    val += ch
                }
                let suffix = ""
                let isSlice = false
                let dotsInARow = 0
                for(i++; i < cmdContent.length; i++){
                    let ch = cmdContent[i]
                    if(ch === "}"){
                        break
                    }
                    if(ch == '.'){
                        dotsInARow++
                        isSlice = true
                        continue
                    }
                    suffix += ch
                }
                if(val == "arg" || val == "args"){
                    if(suffix == "#"){
                        finalText += String(args.length)
                    }
                    else if(dotsInARow == 3){
                        let startingPoint = 0
                        if(suffix){
                            startingPoint = Number(suffix) - 1 || 0
                        }
                        finalText += String(args.slice(startingPoint).join(" "))
                    }
                    else if(dotsInARow == 2){
                        let [n1, n2] = suffix.split("..")
                        finalText += String(args.slice(Number(n1) - 1, Number(n2) - 1).join(" "))
                    }
                    else if(Number(suffix)){
                        finalText += args[Number(suffix) - 1]
                    }
                    else{
                        finalText += `{${cmdContent.slice(startingI, i)}}`
                    }
                }
                else if(val == "opt"){
                    let opt = suffix.replace(":", "")
                    let opts;
                    [opts, args] = getOpts(args)
                    if(opts[opt] !== undefined)
                        finalText += opts[opt]
                }
                else if(val == "sender"){
                    finalText += String(msg.author)
                }
                else if(val ==  "senderid"){
                    finalText += msg.author.id
                }
                else if(val == "sendername"){
                    finalText += String(msg.author.username)
                }
                else if(val == "channel"){
                    finalText += String(msg.channel)
                }
                else{
                    finalText += `{${cmdContent.slice(startingI + 1, i)}}`
                }
                break
            }
            default:{
                if(isEscaped){
                    finalText += `\\${ch}`
                }
                else{
                    finalText += ch
                }
                isEscaped = false
            }
        }
    }
    return finalText
}

function parseDoFirstInnerBracketData(data: string) {
    if(data == "")
        return [undefined, undefined]
    let [doFirstIndex, slice] = data.split(":")
    if(doFirstIndex == data){
        slice = doFirstIndex
        //@ts-ignore
        doFirstIndex = undefined
    }
    else{
        //@ts-ignore
        doFirstIndex = Number(doFirstIndex)
        if(slice)
            slice = slice
        else
            //@ts-ignore
            slice = undefined
    }
    return [doFirstIndex, slice]
}

function parseDoFirst(cmdData: string, doFirstCountNoToArgNo: number, args: string){
    let finalArgs = []
    for(let i = 0; i < args.length; i++){
        let arg = args[i]
        let argIdx = i
        let finalArg = ""
        for(let i = 0; i < arg.length; i++){
            let ch = arg[i]
            if(ch == "%"){
                i++
                ch = arg[i]
                if(ch == "{"){
                    let data = ""
                    for(i++; i < arg.length; i++){
                        ch = arg[i]
                        if(ch == "}") break;
                        data += ch
                    }
                    let [doFirstIndex, slice] = parseDoFirstInnerBracketData(data)
                    console.log(doFirstIndex, slice)
                    if(doFirstIndex !== undefined && slice === undefined){
                        //@ts-ignore
                        finalArg += `${cmdData[doFirstCountNoToArgNo[doFirstIndex]]}`
                    }
                    else if(doFirstIndex === undefined && slice !== undefined){
                        if(slice === "..."){
                            let splitData = cmdData[argIdx]?.split(" ")
                            if(splitData === undefined){
                                finalArg += `%{${data}}`
                            }
                            else{
                                finalArg += splitData[0]
                                finalArgs.push(finalArg)
                                finalArg = ""
                                for(let splitIdx = 1; splitIdx < splitData.length; splitIdx++){
                                    finalArgs.push(splitData[splitIdx])
                                }
                            }
                        }
                        else{
                            //@ts-ignore
                            slice = Number(slice)
                            //@ts-ignore
                            if(slice == -1){
                                finalArg += "__BIRCLE__UNDEFINED__"
                            }
                            else{
                                let splitData = cmdData[argIdx]?.split(" ")
                                //@ts-ignore
                                if(splitData?.[slice] !== undefined){
                                    //@ts-ignore
                                    finalArg += splitData?.[slice]
                                }
                                else{
                                    finalArg += `%{${data}}`
                                }
                            }
                        }
                    }
                    //@ts-ignore
                    else if(doFirstIndex !== argIdx && slice !== undefined){
                        if(slice === "..."){
                            //@ts-ignore
                            if(cmdData[doFirstCountNoToArgNo[doFirstIndex]]){
                                //@ts-ignore
                                let splitData = cmdData[doFirstCountNoToArgNo[doFirstIndex]].split(" ")
                                finalArg += splitData[0]
                                finalArgs.push(finalArg)
                                for(let splitIdx = 1; splitIdx < splitData.length; splitIdx++){
                                    finalArgs.push(splitData[splitIdx])
                                }
                            }
                            else{
                                finalArg += `%{${data}}`
                            }
                        }
                        else{
                            //@ts-ignore
                            slice = Number(slice)
                            //@ts-ignore
                            if(cmdData[doFirstCountNoToArgNo[doFirstIndex]]){
                                //@ts-ignore
                                let splitData = cmdData[doFirstCountNoToArgNo[doFirstIndex]].split(" ")
                                //@ts-ignore
                                finalArg += `${splitData[slice]}`
                            }
                            else{
                                finalArg += `%{${data}}`
                            }
                        }
                    }
                    //@ts-ignore
                    else if(isNaN(doFirstIndex)){
                        finalArg += cmdData[argIdx]
                    }
                    else{
                        finalArg += `%{${data}}`
                    }
                }
                else{
                    finalArg += "%"
                    if(ch)
                        finalArg += ch
                }
            }
            else{
                finalArg += ch
            }
        }
        finalArgs.push(finalArg)
    }
    return finalArgs
}

function operateOnPositionValues(v1: string, op: string, v2: string, areaSize: number, objectSize: number, numberConv: Function){
    let conversions
    if(!objectSize){
        conversions = {
            "center": areaSize / 2,
            "right": areaSize,
            "left": 0,
            "bottom": areaSize,
            "top": 0
        }
    }
    else{
        conversions = {
            "center": areaSize / 2 - objectSize / 2,
            "right": areaSize - objectSize,
            "left": 0,
            "bottom": areaSize - objectSize,
            "top": 0
        }
    }
    if(conversions[v1] !== undefined){
        //@ts-ignore
        v1 = conversions[v1]
    } else v1 = numberConv(v1)
    if(conversions[v2] !== undefined){
        //@ts-ignore
        v2 = conversions[v2]
    } else v2 = numberConv(v2)
    if(v1 == undefined || v1 == null)
        return numberConv(v2)
    switch(op){
        case "+":
            return v1 + v2;
        case "-":
            //@ts-ignore
            return v1 - v2;
        case "*":
            //@ts-ignore
            return v1 * v2;
        case "/":
            //@ts-ignore
            return Math.round(v1 / v2);
        case "%":
            //@ts-ignore
            return Math.round(areaSize * (v1/100))
    }
    return numberConv(v2)
}

function parsePosition(position: string, areaSize: number, objectSize: number, numberConv: Function){
    if(!numberConv) numberConv = parseInt
    let firstVal, secondVal, operator
    let curValue = ""
    for(let char of position){
        switch(char){
            case " ": continue
            case "-":
            case "+":
            case "/":
            case "%":
            case "*":
                operator = char
                firstVal = curValue
                curValue = ""
                break
            default:
                curValue += char
        }
    }
    secondVal = curValue
    return operateOnPositionValues(firstVal as string, operator as string, secondVal, areaSize, objectSize, numberConv)
}

module.exports = {
    parseCmd: parseCmd,
    parsePosition: parsePosition,
    parseAliasReplacement: parseAliasReplacement,
    parseDoFirst: parseDoFirst
}
