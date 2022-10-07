const {prefix, vars, userVars, getVarFn} = require('./common.js')
const {format, safeEval, getOpts} = require('./util.js')

async function buildFormat(sequence, msg, curArg, customFormats){
    let args
    [sequence, ...args] = sequence.split("|")
    for(let format in customFormats){
        if(sequence == format){
            return customFormats[format](sequence, msg, curArg, args)
        }
    }
    switch(sequence){
	case "cmd":
	    return msg.content.split(" ")[0].slice(prefix.length)
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
        return format(fmt, { i: channel.id, n: channel.name })
    }
    case "user":{
        let fmt = args.join(" ") || "<@%i>"
        let member = msg.member
        let user = member.user
        return format(fmt,
            {
                i: user.id || "#!N/A",
                u: user.username || "#!N/A",
                n: member.nickname || "#!N/A",
                X: member.displayHexColor.toString() || "#!N/A",
                x: member.displayColor.toString() || "#!N/A",
                c: user.createdAt.toString() || "#!N/A",
                j: member.joinedAt.toString() || "#!N/A",
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
            let low = args[0]
            let high = args[1] || low * 10
            let dec = ["y", "yes", "true", "t", "."].indexOf(args[2]) > -1 ? true : false
            if(dec)
                return String((Math.random() * (high - low)) + low)
            return String(Math.floor((Math.random() * (high - low)) + low))
        }
        return String(Math.random())
    case "ruser":
        let fmt = args.join(" ") || "%u"
        let member = msg.channel.guild.members.cache.random()
        if(!member)
            member = (await msg.channel.guild.members.fetch()).random()
        let user = member.user
        return format(fmt,
                {
                    i: user.id || "#!N/A",
                    u: user.username || "#!N/A",
                    n: member.nickname || "#!N/A",
                    X: member.displayHexColor.toString() || "#!N/A",
                    x: member.displayColor.toString() || "#!N/A",
                    c: user.createdAt.toString() || "#!N/A",
                    j: member.joinedAt.toString() || "#!N/A",
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
		"N!": `${msg.channel.nsfw}`,
		"n": `${msg.channel.name}`,
		"c": `${msg.channel.createdAt}`
	    })


    }
    if(args.length > 0){
        return `{${sequence}|${args.join("|")}}`
    }
    return `{${sequence}}`
}

function buildEscape(letter, sequence, msg, curArg){
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
            return String.fromCodePoint(parseInt(`0x${sequence}`))
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
            return (new Date(sequence)).toString()
        case "D":
            return (new Date(parseInt(sequence))).toString()
        case "V": {
            let [scope, ...name] = sequence.split(":")
            name = name.join(":")
            if(scope == "%"){
                scope = msg.author.id
            }
            else if(scope == "."){
                let v = getVarFn(name, false)
                if(v)
                    return v(msg, curArg)
                else return `\\v{${sequence}}`
            }
            let v = getVarFn(name, false, scope)
            if(v)
                return v(msg, curArg)
            else return `\\v{${sequence}}`
        }
        case "v":
            let num = Number(sequence)
            //basically checks if it's a n
            if(!isNaN(num)){
                let args = msg.content.split(" ")
                return String(args[num])
            }
            try{
                let name = sequence
                if(sequence.split(":")[0] == "."){
                    name = sequence.split(":").slice(1).join(":")
                }
                let v = getVarFn(name, false, msg.author.id)
                if(v)
                    return v(msg, curArg)
                else return `\\v{${sequence}}`
            } catch(err){
                console.log(err)
                return "\\V"
            }
        case "\\":
            return "\\"
        default:
            if(sequence){
                return `${letter}{${sequence}}`
            }
            return `${letter}`
    }
}

function getCommand(content){
    return content.split(" ")[0].replace(prefix, "")
}

async function parseCmd({msg, content, command, customEscapes, customFormats}){
    if(!content) content = msg.content
    if(!command){
        command = getCommand(content.slice(prefix.length))
        content = content.slice(command.length + prefix.length)
    }
    let args = []
    //it should be smth like: {3: "$(...)"}, where 3 represents the argNo
    let doFirsts = {}
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
                    let inside = ""
                    let parenCount = 1
                    for(i++; parenCount != 0; i++){
                        ch = content[i]
                        if(!ch) break
                        if(ch == "["){
                            parenCount++
                        } else if(ch == "]"){
                            parenCount--
                        }
                        if(parenCount != 0) inside += ch;
                    }
                    i--
                    curArg = curArg.replaceAll(/(?<!\\)%\{\}/g, String(safeEval(inside, {uid: msg.member?.id, uavatar: msg.member?.avatar, ubannable: msg.member?.bannable, ucolor: msg.member?.displayColor, uhex: msg.member?.displayHexColor, udispname: msg.member?.displayName, ujoinedAt: msg.member?.joinedAt, ujoinedTimeStamp: msg.member?.joinedTimestamp, unick: msg.member?.nickname, curArg: curArg, ...vars}, {timeout: 1000})))
                }
                else if(ch === "("){
                    if(!curArg.match(/(%\{\d*\}|%\{-1\})/g)) curArg += "%{}"
                    let inside = prefix
                    let parenCount = 1
                    for(i++; parenCount != 0; i++){
                        ch = content[i]
                        if(!ch) break
                        if(ch == "("){
                            parenCount++
                        } else if(ch == ")"){
                            parenCount--
                        }
                        if(parenCount != 0) inside += ch;
                    }
                    i--
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
            case "\\":
                i++
                ch = content[i]
                if(ch === undefined){
                    curArg += "\\"
                    break
                }
                let prefixLetter = ch
                i++
                ch = content[i]
                let sequence = ""
                if(ch == "{"){
                    for(i++; i < content.length; i++){
                        ch = content[i]
                        if(ch == "}") break;
                        sequence += ch
                    }
                }else{
                    //We only want to go back a character, if there is no sequence, otherwise } will be tacked on
                    i--
                }
                curArg += buildEscape(prefixLetter, sequence, msg, curArg, customEscapes)
                break;
            case "{":
                let value = ""
                let parenCount = 1
                for(i++; i < content.length; i++){
                    ch = content[i]
                    if(ch == "{"){
                        parenCount++
                    }
                    if(ch == "}"){
                        parenCount--
                    }
                    if(parenCount == 0) break
                    value += ch
                }
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

function parseAliasReplacement(msg, cmdContent, args){
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
                        finalText += String(args.slice(Number(suffix) - 1).join(" "))
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

function parseDoFirstInnerBracketData(data) {
    if(data == "")
        return [undefined, undefined]
    let [doFirstIndex, slice] = data.split(":")
    if(doFirstIndex == data){
        slice = Number(doFirstIndex)
        doFirstIndex = undefined
    }
    else{
        doFirstIndex = Number(doFirstIndex)
        if(slice)
            slice = Number(slice)
        else
            slice = undefined
    }
    return [doFirstIndex, slice]
}

function parseDoFirst(cmdData, doFirstCountNoToArgNo, args){
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
                    if(doFirstIndex !== undefined && slice === undefined){
                        finalArg += `${cmdData[doFirstCountNoToArgNo[doFirstIndex]]}`
                    }
                    else if(doFirstIndex === undefined && slice !== undefined){
                        if(slice == -1){
                            finalArg += "__BIRCLE__UNDEFINED__"
                        }
                        else{
                            if(cmdData[doFirstCountNoToArgNo[argIdx]]){
                                let splitData = cmdData[doFirstCountNoToArgNo[argIdx]].split(" ")
                                finalArg += splitData[slice]
                            }
                            else{
                                finalArg += `%{${data}}`
                            }
                        }
                    }
                    else if(doFirstIndex !== argIdx && slice !== undefined){
                        if(cmdData[doFirstCountNoToArgNo[doFirstIndex]]){
                            let splitData = cmdData[doFirstCountNoToArgNo[doFirstIndex]].split(" ")
                            finalArg += `${splitData[slice]}`
                        }
                        else{
                            finalArg += `%{${data}}`
                        }
                    }
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

function operateOnPositionValues(v1, op, v2, areaSize, objectSize, numberConv){
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
        v1 = conversions[v1]
    } else v1 = numberConv(v1)
    if(conversions[v2] !== undefined){
        v2 = conversions[v2]
    } else v2 = numberConv(v2)
    if(v1 == undefined || v1 == null)
        return numberConv(v2)
    switch(op){
        case "+":
            return v1 + v2;
        case "-":
            return v1 - v2;
        case "*":
            return v1 * v2;
        case "/":
            return Math.round(v1 / v2);
        case "%":
            return Math.round(areaSize * (v1/100))
    }
    return numberConv(v2)
}

function parsePosition(position, areaSize, objectSize, numberConv){
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
    return operateOnPositionValues(firstVal, operator, secondVal, areaSize, objectSize, numberConv)
}

module.exports = {
    parseCmd: parseCmd,
    parsePosition: parsePosition,
    parseAliasReplacement: parseAliasReplacement,
    parseDoFirst: parseDoFirst
}
