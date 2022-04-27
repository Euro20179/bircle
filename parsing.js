import {prefix, vars} from './common.js'
import {format} from './util.js'

function buildFormat(sequence, msg, curArg, customFormats){
    let args
    [sequence, ...args] = sequence.split("|")
    for(let format in customFormats){
        if(sequence == format){
            return customFormats[format](sequence, msg, curArg, args)
        }
    }
    switch(sequence){
        case "user":
            return `<@${msg.author.id}>`
        case "rand":
            if(args && args?.length > 0)
                return args[Math.floor(Math.random() * args.length)]
            return "{rand}"
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
            return vars[sequence](msg, curArg) || "\\V"
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

function parseCmd({msg, content, command, customEscapes, customFormats}){
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
                if(curArg.indexOf("%{}") === -1) curArg += "%{}"
                if(ch === "("){
                    let inside = "["
                    let parenCount = 1
                    for(i++; parenCount != 0; i++){
                        ch = content[i]
                        if(ch == "("){
                            parenCount++
                        } else if(ch == ")"){
                            parenCount--
                        }
                        if(parenCount != 0) inside += ch;
                    }
                    doFirsts[argNo] = inside
                    i--
                }
                break;
            case "\\":
                i++
                ch = content[i]
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
                for(i++; i < content.length; i++){
                    ch = content[i]
                    if(ch == "}"){
                        break;
                    }
                    value += ch
                }
                curArg += buildFormat(value, msg, curArg, customFormats)
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

function operateOnPositionValues(v1, op, v2, areaSize, objectSize){
    console.log(v1, op, v2)
    const conversions = {
        "center": areaSize / 2 - objectSize / 2,
        "left": areaSize - objectSize,
        "right": 0,
        "bottom": areaSize - objectSize,
        "top": 0
    }
    if(conversions[v1] !== undefined){
        v1 = conversions[v1]
    } else v1 = parseInt(v1)
    if(conversions[v2] !== undefined){
        v2 = conversions[v2]
    } else v2 = parseInt(v2)
    if(v1 == undefined || v1 == null)
        return parseInt(v2)
    switch(op){
        case "+":
            return v1 + v2;
        case "-":
            return v1 - v2;
        case "*":
            return v1 * v2;
        case "/":
            return Math.round(v1 / v2);
    }
    return parseInt(v2)
}

function parsePosition(position, areaSize, objectSize){
    let firstVal, secondVal, operator
    let curValue = ""
    console.log(position)
    for(let char of position){
        switch(char){
            case "-":
            case "+":
            case "/":
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
    return operateOnPositionValues(firstVal, operator, secondVal, areaSize, objectSize)
}

export{
    parseCmd,
    parsePosition
}