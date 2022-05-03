const {prefix, vars} = require('./common.js')
const {format, safeEval} = require('./util.js')

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
	case "rev":
	case "reverse":
	    return [...sequence].reverse().join("")
	case 'c':
	    return msg.content.split(" ").slice(1).join(" ").trim()
        case "user":{
	    let fmt = args.join(" ") || "<@%i>"
            let member = await msg.channel.guild.members.fetch(msg.author.id)
            let user = member.user
            return format(fmt
                    .replaceAll("{id}", user.id || "#!N/A")
                    .replaceAll("{username}", user.username || "#!N/A")
                    .replaceAll("{nickname}", member.nickName || "#!N/A")
                    .replaceAll("{0xcolor}", member.displayHexColor.toString() || "#!N/A")
                    .replaceAll("{color}", member.displayColor.toString() || "#!N/A")
                    .replaceAll("{created}", user.createdAt.toString() || "#!N/A")
                    .replaceAll("{joined}", member.joinedAt.toString() || "#!N/A")
                    .replaceAll("{boost}", member.premiumSince?.toString() || "#!N/A"),
                    {
                        i: user.id || "#!N/A",
                        u: user.username || "#!N/A",
                        n: member.nickName || "#!N/A",
                        X: member.displayHexColor.toString() || "#!N/A",
                        x: member.displayColor.toString() || "#!N/A",
                        c: user.createdAt.toString() || "#!N/A",
                        j: member.joinedAt.toString() || "#!N/A",
                        b: member.premiumSince?.toString() || "#!N/A"
                    }
                )
	}
        case "rand":
            if(args && args?.length > 0)
                return args[Math.floor(Math.random() * args.length)]
            return "{rand}"
        case "ruser":
            let fmt = args.join(" ") || "%u"
            let member = msg.channel.guild.members.cache.random()
            if(!member)
                member = (await msg.channel.guild.members.fetch()).random()
            let user = member.user
            return format(fmt
                    .replaceAll("{id}", user.id || "#!N/A")
                    .replaceAll("{username}", user.username || "#!N/A")
                    .replaceAll("{nickname}", member.nickName || "#!N/A")
                    .replaceAll("{0xcolor}", member.displayHexColor.toString() || "#!N/A")
                    .replaceAll("{color}", member.displayColor.toString() || "#!N/A")
                    .replaceAll("{created}", user.createdAt.toString() || "#!N/A")
                    .replaceAll("{joined}", member.joinedAt.toString() || "#!N/A")
                    .replaceAll("{boost}", member.premiumSince?.toString() || "#!N/A"),
                    {
                        i: user.id || "#!N/A",
                        u: user.username || "#!N/A",
                        n: member.nickName || "#!N/A",
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
                    "D": `${date.getMonth()}/${date.getDate()}/${date.getFullYear()}`,
                    "m": `${date.getMonth()}`,
                    "d": `${date.getDate()}`,
                    "Y": `${date.getFullYear()}`,
                    "w": `${date.getDay()}`
                })
        case "arg":
            return curArg
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
        case "V":
	    let num = Number(sequence)
	    //basically checks if it's a n
	    if(!isNaN(num)){
		let args = msg.content.split(" ")
		return String(args[num])
	    }
	    try{
		return vars[sequence](msg, curArg) || "\\V"
	    } catch(err){
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
        content = content.replace(`${prefix}${command}`, "").trim()
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
                if(ch == "$"){
                    curArg += "$"
                        break;
                }
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
		    curArg = curArg.replaceAll(/(?<!\\)%\{\}/g, String(safeEval(inside, {user: msg.author, curArg: curArg})))
		}
                if(ch === "("){
                    if(curArg.indexOf("%{}") === -1) curArg += "%{}"
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
}
