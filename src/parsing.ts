enum T {
    str,
    dofirst,
    calc,
    esc,
    format,
    dofirstrepl,
    syntax,
    pipe,
    variable,
    end_of_line
}

function strToTT(str: string) {
    switch (str.toLowerCase()) {
        case "str":
            return T.str

        case "dofirst":
            return T.dofirst

        case "calc":
            return T.calc

        case "esc":
            return T.esc

        case "format":
            return T.format

        case "dofirstrepl":
            return T.dofirstrepl

        case "syntax":
            return T.syntax

        case "pipe":
            return T.pipe

        case 'end_of_line':
            return T.end_of_line

        default:
            return T.str
    }
}

class Token {
    id: number
    constructor(public type: T, public data: string | string[], public argNo: number) {
        this.id = Math.random()
    }
    originalText() {
        switch (this.type) {
            case T.dofirst:
                return `$(${this.data})`
            case T.calc:
                return `$[${this.data}]`
            case T.esc: {
                let text = `\\${this.data[0]}`
                if (this.data[1]) {
                    text += `{${this.data[1]}}`
                }
                return text
            }
            case T.format: return `{${this.data}}`
            case T.dofirstrepl: return `%{${this.data}}`
            case T.variable: {
                let text = `\${${this.data[0]}`
                if (this.data[1]) {
                    text += `${this.data[1]}`
                }
                return text + "}"
            }
            case T.str: case T.pipe: {
                return typeof this.data === 'object' ? JSON.stringify(this.data) : this.data
            }
            case T.syntax: {
                return JSON.stringify(this.data)
            }
            case T.end_of_line: {
                return '[;'
            }
        }
    }
}


function operateOnPositionValues(v1: string, op: string, v2: string, areaSize: number, objectSize?: number, numberConv: Function = Number) {
    let conversions
    if (!objectSize) {
        conversions = {
            "center": areaSize / 2,
            "right": areaSize,
            "left": 0,
            "bottom": areaSize,
            "top": 0
        }
    }
    else {
        conversions = {
            "center": areaSize / 2 - objectSize / 2,
            "right": areaSize - objectSize,
            "left": 0,
            "bottom": areaSize - objectSize,
            "top": 0
        }
    }

    let n1, n2

    if (conversions[v1] !== undefined) {
        n1 = conversions[v1]
    } else n1 = numberConv(v1)
    if (conversions[v2] !== undefined) {
        n2 = conversions[v2]
    } else n2 = numberConv(v2)
    if (v1 == undefined || v1 == null)
        return numberConv(v2)
    switch (op) {
        case "+":
            return n1 + n2;
        case "-":
            return n1 - n2;
        case "*":
            return n1 * n2;
        case "/":
            return Math.round(n1 / n2);
        case "%":
            return Math.round(areaSize * (n1 / 100))
    }
    return numberConv(v2)
}

function parsePosition(position: string, areaSize: number, objectSize?: number, numberConv?: Function) {
    if (!numberConv) numberConv = parseInt
    let firstVal, secondVal, operator
    let curValue = ""
    for (let char of position) {
        switch (char) {
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

function getInnerPairsAndDeafultBasedOnRegex(string: string, validStartsWithValues: string[], hasToMatch: RegExp, onMatch?: (match: string, or: string) => any) {
    let innerPairs: [string, string][] = []
    let escape = false
    let curPair = ""
    let buildingOr = false
    let currentOr = ""
    for (let i = 0; i < string.lastIndexOf("}") + 1; i++) {
        let ch = string[i]

        if (ch === "{" && !escape) {
            continue
        }
        else if (ch === "}" && !escape) {
            if (hasToMatch.test(curPair)) {
                innerPairs.push([curPair, currentOr])
                onMatch && onMatch(curPair, currentOr)
            }
            curPair = ""
            currentOr = ""
            buildingOr = false
            continue
        }
        else if (ch === "|" && string[i + 1] === "|") {
            i++;
            buildingOr = true;
            currentOr = "||"
            continue;
        }
        else if (buildingOr) {
            currentOr += ch
        }
        else {
            curPair += ch
        }

        if (!buildingOr && !validStartsWithValues.filter(v => v.length > curPair.length ? v.startsWith(curPair) : curPair.startsWith(v)).length) {
            buildingOr = false
            curPair = ""
            currentOr = ""
        }

        //this needs to be its own if chain because we want escape to be false if it's not \\, this includes {}
        if (ch === "\\") {
            escape = true
        }
        else {
            escape = false
        }

    }
    if (curPair) {
        innerPairs.push([curPair, currentOr])
    }
    return innerPairs
}

type Replacements = { [key: string]: (() => string) | string }

function handleReplacement(replacement: Replacements[string]) {
    if (typeof replacement === 'function') {
        return replacement()
    }
    return replacement
}


function parsePercentFormat(string: string, replacements?: Replacements) {
    let formats = []
    let ploc = -1;
    while ((ploc = string.indexOf("%")) > -1) {
        string = string.slice(ploc + 1)
        let char = string[0]
        if (char === undefined)
            break
        else if (char === "%") {
            formats.push("%")
        }
        else if (replacements) {
            formats.push(handleReplacement(replacements[char]) || char)
        }
        else {
            formats.push(char)
        }
        //skip past char
        string = string.slice(1)
    }
    return formats
}

function formatPercentStr(string: string, replacements: Replacements) {
    let ploc = -1;
    let newStr = ""
    while ((ploc = string.indexOf("%")) > -1) {
        newStr += string.slice(0, ploc)
        string = string.slice(ploc + 1)
        let char = string[0]
        if (char === undefined)
            break
        if (char !== "%") {
            newStr += handleReplacement(replacements[char]) ?? `%${char}`
        }
        else {
            newStr += "%"
        }
        //get past char
        string = string.slice(1)
    }
    newStr += string
    return newStr
}

function formatBracePairs(string: string, replacements: Replacements, pair = "{}", recursion = true) {
    let newStr = ""
    let escape = false
    for (let i = 0; i < string.length; i++) {
        let ch = string[i]
        if (ch === "\\" && !escape) {
            escape = true
        }
        else if (ch == pair[0] && !escape) {
            let inner = parseBracketPair(string.slice(i), pair)
            if (recursion) {
                newStr += handleReplacement(replacements[inner]) ?? `${pair[0]}${formatBracePairs(inner, replacements, pair, recursion)}${pair[1]}`
            }
            else {
                newStr += handleReplacement(replacements[inner]) ?? `${pair[0]}${inner}${pair[1]}`
            }
            i += inner.length + 1
        }
        else {
            escape = false
            newStr += ch
        }
    }
    return newStr
}

function parseBracketPair(string: string, pair: string, start = -1) {
    let count = 1;
    if (string.indexOf(pair[0]) === -1) {
        return ""
    }
    let curStr = ""
    start = start === -1 ? string.indexOf(pair[0]) + 1 : start
    for (let i = start; i < string.length; i++) {
        let ch = string[i]
        if (ch == pair[0]) {
            count++;
        }
        if (ch == pair[1]) {
            count--;
        }
        if (count == 0) {
            return curStr
        }
        //sspecial case when the pairs are the same
        if (count == 1 && pair[0] == ch && pair[1] == pair[0] && curStr) {
            return curStr
        }
        curStr += ch
    }
    return curStr
}

function format(str: string, formats: Replacements, recursion = false) {
    return formatPercentStr(formatBracePairs(str, formats, "{}", recursion), formats)
}

function getOptsUnix(args: ArgumentList, shortOpts: string, longOpts: [string, ":"?][]): [Opts, ArgumentList] {
    let opts: Opts = {}
    let i: number;
    for (i = 0; i < args.length; i++) {
        if(args[i] === "--") {
            i++ //do not count the curent arg (which will be --) as a true arg
            break
        }
        else if(args[i][0] === "-" && args[i][1] === "-"){
            //check this first because --x=y should ALWAYS work even if longOpts is set
            //--x y should only work if longOpts is set
            if(args[i].includes("=")){
                let [left, value] = args[i].split("=")
                opts[left.slice(2)] = value
            }
            else if(longOpts.find(v => v[0] === args[i].slice(2))?.[1]){
                opts[args[i].slice(2)] = args[++i]
            }
            else {
                opts[args[i].slice(2)] = true
            }
        }
        else if (args[i][0] === "-") {
            for(let chN = 1; chN < args[i].length; chN++){
                let ch = args[i][chN]
                let value: string | boolean = ""
                if (shortOpts[shortOpts.indexOf(ch) + 1] === ":"){
                    if(args[i][++chN]){
                        for(let ch of args[i].slice(chN)){
                            value += ch
                        }
                    }
                    else {
                        value = args[++i] || true
                    }
                    opts[ch] = value
                }
                else {
                    opts[ch] = true
                }
            }
        }
        else break
    }
    return [opts, args.slice(i)]
}

function getOpts(args: ArgumentList): [Opts, ArgumentList] {
    let opts: Record<string, boolean | string> = {}
    let i;
    for (i = 0; i < args.length; i++) {
        if (args[i][0] === "-") {
            let [opt, ...value] = args[i].slice(1).split("=")
            if (opt !== "-")
                opts[opt] = value[0] == undefined ? true : value.join("=");
            else {
                i++ //do not count the curent arg (which will be --) as a true arg
                break
            }
        }
        else { break }
    }
    return [opts, args.slice(i)]
}

function getOptsWithNegate(args: ArgumentList): [Opts, ArgumentList] {
    let opts: Record<string, boolean | string> = {}
    let arg, idxOfFirstRealArg = -1;
    while ("-+".includes((arg = args[++idxOfFirstRealArg])?.[0])) {
        if (!arg[1]) break
        switch (arg[0]) {
            case '+': {
                opts[arg.slice(1)] = "false"
                break;
            }
            case '-': {
                let [opt, ...value] = arg.slice(1).split("=")
                if (opt === '-') {
                    //needs to be increased one more time
                    idxOfFirstRealArg++
                    break
                }
                opts[opt] = value[0] == undefined ? true : value.join("=");

            }
        }
    }
    return [opts, args.slice(idxOfFirstRealArg)]
}

function parseRangeString(rangeStr: string): [number, number]{
    let [min, max] = rangeStr.split("..")
    if (max === undefined){
        max = min
    }
    return [Number(min), Number(max)]
}

export {
    parsePosition,
    Token,
    T,
    strToTT,
    getInnerPairsAndDeafultBasedOnRegex,
    format,
    formatPercentStr,
    formatBracePairs,
    parsePercentFormat,
    parseBracketPair,
    getOpts,
    getOptsWithNegate,
    getOptsUnix,
    parseRangeString
}
