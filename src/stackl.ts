import { Message, GuildMember, MessageEmbed, CollectorFilter, ColorResolvable }  from 'discord.js'
import { getVar } from './common'

import { runCmd } from "./commands"

const { vars, prefix } = require( "./common.js")

type stackTypes = number | string | Message | GuildMember | Function | Array<stackTypes> | MessageEmbed | CommandReturn
type errType = {content?: string, err?: boolean, ret?: boolean, stack?: stackTypes[], chgI?: number, end?:  boolean}

async function parseArg(arg: string, argNo: number, argCount: number, args: string[], argc:  number, stack: stackTypes[], initialArgs: string[], ram: { [key: string]: number | string | Message | GuildMember | Function }, currScopes: string[], msg: Message, recursionC: number, stacks: { [key: string]: stackTypes[] }, SPAMS: {[key: string]: boolean}): Promise<stackTypes |  errType >{
        switch (arg) {
            //vars
            case "$stacksize": {
                stack.push(stack.length)
                break
            }
            case "$bottom": {
                if (stack[0] === undefined) {
                    return { err: true, content: "Cannot access the bottom of empty stack" }
                }
                stack.push(stack[0])
                break
            }
            case "$argc": {
                stack.push(argc)
                break
            }
            case "$carson": {
                stack.push("The all legendary Carson Williams")
                break
            }
            case "$argv": {
                stack.push(initialArgs)
                break
            }

            case "%argv": {
                let index = stack.pop()
                if (typeof index !== 'number') {
                    return { err: true, content: `argv index must be a number` }
                }
                if (index >= initialArgs.length) {
                    return { err: true, content: `Argv index out: ${index} of bounds` }
                }
                stack.push(initialArgs[index])
                break
            }

            //operators
            case "++": {
                let val = stack.pop()
                if (typeof val !== 'number') {
                    return { content: `${stack[stack.length - 1]} is not a number`, err: true }
                }
                //@ts-ignore
                let ans = val + 1
                stack.push(ans)
                break;
            }
            case "--": {
                let val = stack.pop()
                switch (typeof val) {
                    case 'number': {
                        let ans = val - 1
                        stack.push(ans)
                        break
                    }
                    case 'object': {
                        if (Array.isArray(val)) {
                            val.pop()
                            stack.push(val)
                            break
                        }
                    }
                    default: {
                        return { content: `${typeof val} -- is not supported`, err: true }
                    }
                }
                break
            }
            case "+": {
                let arg2 = stack.pop()
                let arg1 = stack.pop()
                switch (typeof arg1) {
                    case "number": {
                        if (typeof arg2 !== 'number') {
                            return { content: `${arg2} is not a number`, err: true }
                        }
                        stack.push(arg1 + arg2)
                        break
                    }
                    case "string": {
                        if (typeof arg2 !== 'string') {
                            return { content: `${arg2} is not a string`, err: true }
                        }
                        stack.push(arg1 + arg2)
                        break
                    }
                    default: {
                        return { err: true, content: `type of ${arg1} is unknown` }
                    }
                }
                break
            }
            case "-": {
                let arg2 = stack.pop()
                let arg1 = stack.pop()
                switch (typeof arg1) {
                    case "number": {
                        if (typeof arg2 !== 'number') {
                            return { content: `${arg2} is not a number`, err: true }
                        }
                        stack.push(arg1 - arg2)
                        break
                    }
                    case "string": {
                        if (typeof arg2 !== 'string') {
                            return { content: `${arg2} is not a string`, err: true }
                        }
                        stack.push(arg1.replaceAll(arg2, ""))
                        break
                    }
                    default: {
                        return { err: true, content: `type of ${arg1} is unknown` }
                    }
                }
                break
            }
            case "/": {
                let arg2 = stack.pop()
                let arg1 = stack.pop()
                if (typeof arg1 !== 'number') {
                    return { err: true, content: `${arg1} is not a number` }
                }
                if (typeof arg2 !== 'number') {
                    return { err: true, content: `${arg2} is not a number` }
                }
                stack.push(arg1 / arg2)
                break
            }
            case "*": {
                let arg2 = stack.pop()
                let arg1 = stack.pop()
                switch (typeof arg1) {
                    case 'number': {
                        if (typeof arg2 !== 'number') {
                            return { err: true, content: `${arg2} is not a number` }
                        }
                        stack.push(arg1 * arg2)
                        break
                    }
                    case 'string': {
                        if (typeof arg2 !== 'number') {
                            return { err: true, content: `${arg2} is not a number` }
                        }
                        let ans = ""
                        for (let i = 0; i < arg2; i++) {
                            ans += arg1
                        }
                        stack.push(ans)
                        break
                    }
                }
                break
            }
            case "%s": {
                let arg2 = stack.pop()
                let arg1 = stack.pop()
                if (typeof arg2 == "string") {
                    while ((arg2 = arg2.replace(/%(s|d|.l|f)/, (_match, type) => {
                        if (type === "s") {
                            return String(arg1)
                        }
                        else if (type === "d") {
                            return String(parseInt(String(arg1)))
                        }
                        else if (type === "f") {
                            return String(parseFloat(String(arg1)))
                        }
                        else if (type[1] === 'l') {
                            if (Array.isArray(arg1)) {
                                return arg1.join(type[0])
                            }
                            return `%${type}`
                        }
                        return ""
                    })).match(/%(s|d)/)) {
                        arg1 = stack.pop()
                        if (typeof arg1 === "undefined") {
                            return { content: `ran out of replacements for %s`, err: true }
                        }
                    }
                    stack.push(arg2)
                }
                else {
                    return { content: `${arg2} is not a string`, err: true }
                }
                break
            }
            case "%": {
                let arg2 = stack.pop()
                let arg1 = stack.pop()
                switch (typeof arg1) {
                    case "number": {
                        if (typeof arg2 !== 'number') {
                            return { content: `${arg2} is not a number`, err: true }
                        }
                        stack.push(arg1 - arg2)
                        break
                    }
                    default: {
                        return { err: true, content: `${arg} is not a number` }
                    }
                }
                break
            }
            case ">": {
                let arg2 = stack.pop()
                let arg1 = stack.pop()
                switch (typeof arg1) {
                    case "number": {
                        if (typeof arg2 !== 'number') {
                            return { content: `${arg2} is not a number`, err: true }
                        }
                        stack.push(arg1 > arg2 ? 1 : 0)
                        break
                    }
                    case "string": {
                        if (typeof arg2 !== 'string') {
                            return { content: `${arg2} is not a string`, err: true }
                        }
                        stack.push(arg1.length > arg2.length ? 1 : 0)
                        break
                    }
                    default: {
                        return { err: true, content: `type of ${arg1} is unknown` }
                    }
                }
                break
            }
            case "<": {
                let arg2 = stack.pop()
                let arg1 = stack.pop()
                switch (typeof arg1) {
                    case "number": {
                        if (typeof arg2 !== 'number') {
                            return { content: `${arg2} is not a number`, err: true }
                        }
                        stack.push(arg1 < arg2 ? 1 : 0)
                        break
                    }
                    case "string": {
                        if (typeof arg2 !== 'string') {
                            return { content: `${arg2} is not a string`, err: true }
                        }
                        stack.push(arg1.length < arg2.length ? 1 : 0)
                        break
                    }
                    default: {
                        return { err: true, content: `type of ${arg1} is unknown` }
                    }
                }
                break
            }
            case "==": {
                let ans = stack.pop() == stack.pop() ? true : false
                stack.push(ans ? 1 : 0)
                break
            }

            //logic
            case "||":
            case "%or": {
                let arg1 = stack.pop()
                let arg2 = stack.pop()
                if (typeof arg1 !== 'number') {
                    return { err: true, content: `${arg1} is not a boolean` }
                }
                if (typeof arg2 !== 'number') {
                    return { err: true, content: `${arg2} is not a boolean` }
                }
                if (arg1 === 1 || arg2 === 1) {
                    stack.push(1)
                }
                else {
                    stack.push(0)
                }
                break;
            }
            case "&&":
            case "%and": {
                let arg1 = stack.pop()
                let arg2 = stack.pop()
                if (typeof arg1 !== 'number') {
                    return { err: true, content: `${arg1} is not a boolean` }
                }
                if (typeof arg2 !== 'number') {
                    return { err: true, content: `${arg2} is not a boolean` }
                }
                if (arg1 === 1 && arg2 === 1) {
                    stack.push(1)
                }
                else {
                    stack.push(0)
                }
                break
            }
            case "x|":
            case "%xor": {
                let arg1 = stack.pop()
                let arg2 = stack.pop()
                if (typeof arg1 !== 'number') {
                    return { err: true, content: `${arg1} is not a boolean` }
                }
                if (typeof arg2 !== 'number') {
                    return { err: true, content: `${arg2} is not a boolean` }
                }
                if (arg1 === arg2 && arg1 === 1) {
                    stack.push(0)
                }
                else if ((arg1 === 1 && arg2 === 0) || (arg1 === 0 && arg2 === 1)) {
                    stack.push(1)
                }
                else {
                    stack.push(0)
                }
                break
            }
            case "!&":
            case "%nand": {
                let arg1 = stack.pop()
                let arg2 = stack.pop()
                if (typeof arg1 !== 'number') {
                    return { err: true, content: `${arg1} is not a boolean` }
                }
                if (typeof arg2 !== 'number') {
                    return { err: true, content: `${arg2} is not a boolean` }
                }
                if (arg1 === 1 && arg2 === 1) {
                    stack.push(0)
                }
                else {
                    stack.push(1)
                }
                break
            }
            case "!": {
                let arg1 = stack.pop()
                if (typeof arg1 !== 'number') {
                    return { err: true, content: `${arg1} is not a boolean` }
                }
                stack.push(arg1 === 1 ? 0 : 1)
                break
            }

            //stack manipulation
            case "%istack": {
                let index = stack.pop()
                if (typeof index !== "number") {
                    return { err: true, content: `Cannot index stack with non-number: ${index}` }
                }
                if (index >= stack.length) {
                    return { err: true, content: `Index greater than stack size` }
                }
                stack.push(stack[index])
                break
            }
            case "%cpy": {
                let itemToCopy = stack.pop()
                if (typeof itemToCopy === 'undefined') {
                    return { err: true, content: `Cannot copy undefined` }
                }
                stack.push(itemToCopy)
                stack.push(itemToCopy)
                break
            }
            case "%cpystack": {
                stack.push(...JSON.parse(JSON.stringify(stack)))
                break
            }
            case "%swp": {
                let last = stack.pop()
                let secondLast = stack.pop()
                if (last === undefined) {
                    return { err: true, content: `The top of the stack is undefined` }
                }
                if (secondLast === undefined) {
                    return { err: true, content: "The 2nd top itemf of the stack is undefined" }
                }
                stack.push(last)
                stack.push(secondLast)
                break
            }
            case "%rstack": {
                stack = stack.reverse()
                break
            }
            case "%rotate": {
                stack = stack.map((_v, idx, arr) => idx !== arr.length -1 ? arr[idx + 1] : arr[0])
                break
            }
            case "%pop": {
                stack.pop()
                break
            }

            //functions
            case "%call": {
                let fnArgC = stack.pop()
                if (typeof fnArgC !== 'number') {
                    return { err: true, content: `${fnArgC} is not a number` }
                }
                let fnArgs = []
                for (let i = 0; i < fnArgC; i++) {
                    let item = stack.pop()
                    if (item === undefined) {
                        return { err: true, content: `Argument: ${i} is undefined` }
                    }
                    fnArgs.push(item)
                }
                //otherwise you'd have to put the args in reverse order
                fnArgs = fnArgs.reverse()
                let f = stack.pop()
                if (typeof f !== 'function') {
                    return { err: true, content: `${f} is not a function` }
                }
                recursionC++
                if (recursionC > 1000) {
                    recursionC = 0
                    return { err: true, content: "Recursion limit reeached" }
                }
                let resp = await f(...fnArgs)
                recursionC--
                if (resp?.err) {
                    return resp
                }
                else if (resp?.ret) {
                    for (let item of resp?.stack) {
                        stack.push(item)
                    }
                    return { ret: true, stack: stack }
                }
                else if (resp?.stack) {
                    for (let arg of resp.stack) {
                        stack.push(arg)
                    }
                }
                else stack.push(resp)
                break
            }
            case "%return": {
                return { ret: true, stack: stack }
            }
            case "%function": {
                let name = args[argNo + 1]
                if (name === undefined || name === null) {
                    return { err: true, content: `${name} is not a valid function name` }
                }
                let code: any = []
                let chgI = 1
                for (let i = argNo + 2; i < argCount; i++) {
                    chgI++
                    if (args[i] == '%functionend') {
                        break
                    }
                    code.push(args[i])
                }
                ram[name] = async (...args: any[]) => {
                    let stack = args
                    for (let i = 0; i < code.length; i++) {
                        let rv = await parseArg(code[i], i, code.length, code, argc, stack, initialArgs, ram, currScopes, msg, recursionC, stacks, SPAMS)
                        //@ts-ignore
                        if (rv?.end) return { end: true }
                        //@ts-ignore
                        if (rv?.chgI)
                            //@ts-ignore
                            i += parseInt(rv.chgI)
                            //@ts-ignore
                        if (rv?.err) {
                            //@ts-ignore
                            return { chgI: i - argNo, ...rv }
                        }
                        //@ts-ignore
                        if(rv?.stack){
                            //@ts-ignore
                            stack = rv.stack
                        }

                    }
                    return { stack: stack }
                }
                return { chgI: chgI }
            }

            //misc
            case "%json": {
                let value = stack.pop()
                stack.push(JSON.stringify(value))
                break
            }
            case "%obj": {
                let value = stack.pop()
                if (value === undefined) {
                    return { err: true, content: "Cannot convert undefined to an object" }
                }
                if (typeof value !== 'string') {
                    value = JSON.stringify(value)
                }
                try{
                    stack.push(JSON.parse(value))
                }
                catch(err){
                    stack.push(0)
                }
                break
            }
            case "%run": {
                let text = stack.pop()
                if(typeof text !== 'string'){
                    return {err: true, content: "Cannot run a non-string"}
                }
                let data = await runCmd(msg, text, 19, true)
                if(data === undefined){
                    stack.push(0)
                }
                else{
                    stack.push(data)
                }
                break
            }
            case "%isnumeric": {
                let val = stack.pop()
                if (typeof val === 'number') {
                    stack.push(1)
                }
                else if (typeof val === 'string' && val.match(/^-?\d+(\.\d+)?$/)) {
                    stack.push(1)
                }
                else {
                    stack.push(0)
                }
                break
            }
            case "%time": {
                stack.push(Date.now())
                break
            }
            case "%sleep": {
                let amount = stack.pop()
                if (typeof amount !== 'number') {
                    return { err: true, content: "Time to sleep is NaN" }
                }
                await new Promise(res => setTimeout(res, amount as number))
                break
            }


            //vars
            case "%stack": {
                let scopeName = args[argNo + 1]
                if (typeof scopeName !== 'string') {
                    return { err: true, content: "Scope name must be a string" }
                }
                if (stacks[scopeName] !== undefined) {
                    return { err: true, content: `Scope name: ${scopeName} already exists` }
                }
                stacks[scopeName] = []
                currScopes.push(scopeName)
                return { chgI: 1 }
            }
            case "%stackend": {
                let scopeName = args[argNo + 1]
                if (typeof scopeName !== 'string') {
                    return { err: true, content: "Scope name must be a string" }
                }
                if (scopeName === '__main__') {
                    return { end: true }
                }
                if (currScopes[currScopes.length - 1] !== scopeName) {
                    return { err: true, content: `Scope name: ${scopeName} is not the newest scope` }
                }
                stacks[scopeName] = []
                currScopes.pop()
                return { chgI: 1 }
            }
            case "%saveas": {
                stack.push("%saveas")
                break
            }
            case "%vexists": {
                let varName = stack.pop()
                if (typeof varName !== 'string') {
                    return { err: true, content: `${varName} is not a valid variable name` }
                }
                if (vars["__global__"][varName]) {
                    stack.push(1)
                }
                else {
                    stack.push(0)
                }
                break
            }
            case "%uvexists": {
                let varName = stack.pop()
                if (typeof varName !== 'string') {
                    return { err: true, content: `${varName} is not a valid variable name` }
                }
                if (vars[msg.author.id]?.[varName]) {
                    stack.push(1)
                }
                else {
                    stack.push(0)
                }
                break
            }
            case "%lvar": {
                stack.push("%lvar")
                break
            }
            case "%gvar": {
                let name = stack.pop()
                if (typeof name !== 'string') {
                    return { err: true, content: `${name} is not a valid variable name` }
                }
                if (vars["__global__"][name]) {
                    stack.push(getVar(msg, name))
                }
                else {
                    return { err: true, content: `${name} is not defined` }
                }
                break
            }
            case "%sram": {
                stack.push("%sram")
                break
            }
            case "%gexists": {
                let name = stack.pop()
                if (typeof name !== 'string') {
                    return { err: true, content: `${name} is not a valid variable name` }
                }
                if (ram[name] !== undefined) {
                    stack.push(1)
                }
                else {
                    stack.push(0)
                }
                break

            }
            case "%gram": {
                let name = stack.pop()
                if (typeof name !== 'string') {
                    return { err: true, content: `${name} is not a valid variable name` }
                }
                if (ram[name]) {
                    stack.push(ram[name])
                }
                else {
                    return { err: true, content: `${name} is not defined` }
                }
                break
            }
            case "%lram": {
                stack.push('%lram')
                break
            }

            //message manipulation
            case "%send": {
                let ans = stack.pop()
                if (ans == undefined || ans == null) {
                    return { content: "Nothing to send", err: true }
                }
                stack.push(await msg.channel.send(String(ans)))
                break
            }
            case "%edit": {
                let newText = stack.pop()
                let m = stack.pop()
                if (!(m instanceof Message)) {
                    return { content: `${m} is not a message`, err: true }
                }
                if (typeof newText !== 'string') {
                    return { content: `${newText} is not a string`, err: true }
                }
                stack.push(await m.edit(newText));
                break
            }
            case "%reply": {
                let text = stack.pop()
                let msgToRTo = stack.pop()
                if (typeof text !== 'string') {
                    return { err: true, content: `${text} is not a string` }
                }
                if (!(msgToRTo instanceof Message)) {
                    return { err: true, content: `Cannot reply to non-message: ${msgToRTo}` }
                }
                stack.push(await msgToRTo.reply(text))
                break
            }
            case "%getmsg": {
                let val = stack.pop()
                if (typeof val !== 'string') {
                    return { content: `${val} is not a string`, err: true }
                }
                try {
                    let m = await msg.channel.messages.fetch(val)
                    if (!m) {
                        stack.push(0)
                    }
                    else stack.push(m)
                }
                catch (err) {
                    console.log(err)
                    stack.push(0)
                }
                break
            }
            case "%msg": {
                stack.push(msg)
                break
            }

            //embeds
            case "%embed": {
                stack.push(new MessageEmbed())
                break
            }
            case "%etitle": {
                let title = stack.pop()
                if (typeof title !== 'string') {
                    return { err: true, content: `Title for %etitle must be string` }
                }
                let e = stack.pop()
                if (!(e instanceof MessageEmbed)) {
                    return { err: true, content: `${e} is not an embed, cannot set title` }
                }
                e.setTitle(title)
                stack.push(e)
                break
            }
            case "%eimg": {
                let imgUrl = stack.pop()
                if (typeof imgUrl !== 'string') {
                    return { err: true, content: `imgUrl for %eimg must be a string` }
                }
                let e = stack.pop()
                if (!(e instanceof MessageEmbed)) {
                    return { err: true, content: `${e} is not an embed, cannot set thumbnail` }
                }
                e.setImage(imgUrl)
                stack.push(e)
                break
            }
            case "%ethumb": {
                let thumbUrl = stack.pop()
                if (typeof thumbUrl !== 'string') {
                    return { err: true, content: `thumburl for %ethumb must be a string` }
                }
                let e = stack.pop()
                if (!(e instanceof MessageEmbed)) {
                    return { err: true, content: `${e} is not an embed, cannot set thumbnail` }
                }
                e.setThumbnail(thumbUrl)
                stack.push(e)
                break
            }
            case "%efld": {
                let inline = stack.pop()
                if (typeof inline !== 'number') {
                    return { err: true, content: `Inline must be a boolean` }
                }
                let value = stack.pop()
                if (typeof value !== 'string') {
                    return { err: true, content: `value must be a string` }
                }
                let title = stack.pop()
                if (typeof title !== 'string') {
                    return { err: true, content: `initialArgs must be a string` }
                }
                let e = stack.pop()
                if (!(e instanceof MessageEmbed)) {
                    return { err: true, content: `${e} is not an embed` }
                }
                e.addField(title, value, Boolean(inline))
                stack.push(e)
                break
            }
            case "%eftr": {
                let image = stack.pop()
                if (typeof image !== 'string' && image !== 0) {
                    return { err: true, content: `Footer image must be a string or 0` }
                }
                let footer = stack.pop()
                if (typeof footer !== 'string') {
                    return { err: true, content: `footer must be a string` }
                }
                let e = stack.pop()
                if (!(e instanceof MessageEmbed)) {
                    return { err: true, content: `${e} is not an embed` }
                }
                if (typeof image === 'string') {
                    e.setFooter({ text: footer, iconURL: image })
                }
                else {
                    e.setFooter({ text: footer })
                }
                stack.push(e)
                break
            }
            case "%edesc": {
                let description = stack.pop()
                if (typeof description !== 'string') {
                    return { err: true, content: `description must be a string` }
                }
                let e = stack.pop()
                if (!(e instanceof MessageEmbed)) {
                    return { err: true, content: `${e} is not an embed` }
                }
                e.setDescription(description)
                stack.push(e)
                break
            }
            case "%etstmp": {
                let time = stack.pop()
                if (typeof time !== 'number') {
                    return { err: true, content: `Timestamp must be a number` }
                }
                let e = stack.pop()
                if (!(e instanceof MessageEmbed)) {
                    return { err: true, content: `${e} is not an embed` }
                }
                e.setTimestamp(new Date(time || Date.now()))
                stack.push(e)
                break
            }
            case "%eauth": {
                let image = stack.pop()
                if (typeof image !== 'string' && image !== 0) {
                    return { err: true, content: `Footer image must be a string or 0` }
                }
                let author = stack.pop()
                if (typeof author !== 'string') {
                    return { err: true, content: `author must be a string` }
                }
                let e = stack.pop()
                if (!(e instanceof MessageEmbed)) {
                    return { err: true, content: `${e} is not an embed` }
                }
                if (typeof image === 'string') {
                    e.setAuthor({ name: author, iconURL: image })
                }
                else {
                    e.setAuthor({ name: author })
                }
                stack.push(e)
                break
            }
            case "%eclr": {
                let color = stack.pop()
                let e = stack.pop()
                if (!(e instanceof MessageEmbed)) {
                    return { err: true, content: `${e} is not an embed` }
                }
                try {
                    let colorsToStrings = {
                        "red": [255, 0, 0],
                        "green": [0, 255, 0],
                        "blue": [0, 0, 255],
                        "yellow": [255, 255, 0],
                        "purple": [255, 0, 255],
                        "cyan": [0, 255, 255],
                        "white": [255, 255, 255],
                        "black": [1, 1, 1],
                        "blackblack": [0, 0, 0],
                        "random": [Math.floor(Math.random() * 256), Math.floor(Math.random() * 256), Math.floor(Math.random() * 256)]
                    }
                    if (typeof color === 'string') {
                        //@ts-ignore
                        color = colorsToStrings[color.toLowerCase()]
                    }
                    e.setColor(color as ColorResolvable)
                }
                catch (err) {
                    console.log(err)
                    return { err: true, content: `${color} is not a valid color` }
                }
                stack.push(e)
                break
            }

            //string manipulation
            case "%repl": {
                let repl = stack.pop()
                if (typeof repl !== 'string') {
                    return { err: true, content: 'Replacement must be a string' }
                }
                let find = stack.pop()
                if (typeof find !== 'string') {
                    return { err: true, content: 'Search must be a string' }
                }
                let str = stack.pop()
                if (typeof str !== 'string') {
                    return { err: true, content: "String to operate on must be string" }
                }
                stack.push(str.replaceAll(find, repl))
                break
            }
            case "%rtrunc": {
                let bytes = stack.pop()
                if (typeof bytes !== 'number') {
                    return { err: true, content: "The amount of bytes must be a number" }
                }
                let str = stack.pop()
                if (typeof str !== 'string') {
                    return { err: true, content: "Cannot truncate non string" }
                }
                let ans = str.slice(0, str.length - bytes)
                if (ans.length == 0) {
                    return { err: true, content: "Truncatation size is larger than string size" }
                }
                stack.push(ans)
                break
            }
            case "%ltrunc": {
                let bytes = stack.pop()
                if (typeof bytes !== 'number') {
                    return { err: true, content: "The amount of bytes must be a number" }
                }
                let str = stack.pop()
                if (typeof str !== 'string') {
                    return { err: true, content: "Cannot truncate non string" }
                }
                let ans = str.slice(bytes, str.length)
                if (ans.length == 0) {
                    return { err: true, content: "Truncatation size is larger than string size" }
                }
                stack.push(ans)
                break
            }
            case "%trim": {
                let val = stack.pop()
                if (typeof val !== 'string') {
                    return { err: true, content: `${val} is not a string` }
                }
                stack.push(val.trim())
                break
            }
            case "%split": {
                let val = stack.pop()
                if (typeof val !== 'string') {
                    return { err: true, content: `${val} is not a string` }
                }
                let str = stack.pop()
                if (typeof str !== 'string') {
                    return { err: true, content: `${str} is not a string` }
                }
                stack.push(str.split(val))
                break
            }
            case "%upper": {
                let val = stack.pop()
                if (typeof val !== "string") {
                    return { content: `${val} is not a string`, err: true }
                }
                stack.push(val.toUpperCase())
                break
            }
            case "%str": {
                let val = stack.pop()
                stack.push(String(val))
                break
            }
            case "%int": {
                let val = stack.pop()
                if (typeof val !== 'string') {
                    return { err: true, content: `${val} is not a string` }
                }
                let ans = parseInt(val)
                if (isNaN(ans)) {
                    return { err: true, content: `Result was NaN` }
                }
                stack.push(ans)
                break
            }
            case "%float": {
                let val = stack.pop()
                if (typeof val !== 'string') {
                    return { err: true, content: `${val} is not a string` }
                }
                let ans = parseFloat(val)
                if (isNaN(ans)) {
                    return { err: true, content: `Result was NaN` }
                }
                stack.push(ans)
                break
            }

            //number manipulation
            case "%lower": {
                let val = stack.pop()
                if (typeof val !== "string") {
                    return { content: `${val} is not a string`, err: true }
                }
                stack.push(val.toLowerCase())
                break
            }
            case "%floor": {
                let val = stack.pop()
                if (typeof val !== 'number') {
                    return { err: true, content: `${val} is not a number` }
                }
                stack.push(Math.floor(val))
                break
            }
            case "%ceil": {
                let val = stack.pop()
                if (typeof val !== 'number') {
                    return { err: true, content: `${val} is not a number` }
                }
                stack.push(Math.ceil(val))
                break
            }
            case "%rand": {
                stack.push(Math.random())
                break
            }

            //users
            case "%getusr": {
                let val = stack.pop()
                if (typeof val !== 'string') {
                    return { content: `${val} is not a string`, err: true }
                }
                try {
                    let u = await msg.guild?.members.fetch(val)
                    if (!u) {
                        stack.push(0)
                    }
                    else stack.push(u)
                }
                catch (err) {
                    console.log(err)
                    stack.push(0)
                }
                break
            }

            //list manipulation
            case "%join": {
                let val = stack.pop()
                if (typeof val !== 'string') {
                    return { err: true, content: `${val} is not a string` }
                }
                let arr = stack.pop()
                if (!Array.isArray(arr)) {
                    return { err: true, content: `${arr} is not a list` }
                }
                stack.push(arr.join(val))
                break
            }
            case "%index": {
                let indexNo = stack.pop()
                let startIndex = null
                let indexee = stack.pop()
                if (typeof indexNo === 'string') {
                    [startIndex, indexNo] = indexNo.split(":")
                    startIndex = Number(startIndex)
                    indexNo = Number(indexNo)
                    if (isNaN(startIndex) || isNaN(indexNo)) {
                        return { err: true, content: `Cannot index with non-range: ${indexNo}` }
                    }
                }
                if (typeof indexNo !== 'number') {
                    return { err: true, content: `cannot index with non-number: ${indexNo}` }
                }
                switch (typeof indexee) {
                    case 'string': {
                        if (startIndex !== null) {
                            stack.push(indexee.slice(startIndex, indexNo))
                        }
                        else {
                            stack.push(indexee[indexNo])
                        }
                        break
                    }
                    case 'object': {
                        if (Array.isArray(indexee)) {
                            if (startIndex !== null) {
                                stack.push(indexee.slice(startIndex, indexNo))
                            }
                            else {
                                stack.push(indexee[indexNo])
                            }
                            break
                        }
                    }
                    default: {
                        return { err: true, content: `Cannot index ${typeof indexee}` }
                    }
                }
                break
            }
            case "%list": {
                let list = []
                let chgI = 0
                let count = stack.pop()
                if (!isNaN(Number(count))) {
                    for (let i = 0; i < parseInt(String(count)); i++) {
                        let val = stack.pop()
                        if (typeof val === 'undefined') {
                            return { err: true, content: `arg: ${i} in list is undefined` }
                        }
                        list.push(val)
                    }
                }
                else {
                    return { err: true, content: `No list length given` }
                }
                stack.push(list.reverse())
                return { chgI: chgI }
            }
            case "%end": {
                return { end: true }
            }
            case "%break": {
                return { end: true }
            }
            case "%find": {
                let matcher = stack.pop()
                if (matcher === undefined) {
                    return { err: true, content: `Matcher cant be undefined` }
                }
                let matchee = stack.pop()
                if (Array.isArray(matchee)) {
                    let index = matchee.indexOf(matcher)
                    stack.push(index)
                }
                else if (typeof matchee === 'string') {
                    if (typeof matcher !== 'string') {
                        return { err: true, content: `The matcher for a string must be a string` }
                    }
                    let match = matchee.match(matcher)
                    if (match?.index) {
                        stack.push(match.index)
                    }
                    else {
                        stack.push(-1)
                    }
                }
                else {
                    return { err: true, content: `Matchee cannot be of type: ${typeof matchee}` }
                }
                break
            }

            //control flow
            case "%loop": {
                let code = []
                let chgI = 0
                for (let i = argNo + 1; i < argCount; i++) {
                    chgI++
                    if (args[i] == "%loopend") {
                        break
                    }
                    if (args[i] == "%loop") {
                        return { err: true, content: `Nested loops are not allowed` }
                    }
                    code.push(args[i])
                }
                let loopCount = 0
                let id = Math.floor(Math.random() * 100000000)
                SPAMS[id] = true
                forever: while (true) {
                    if (!SPAMS[id])
                        break
                    loopCount++
                    for (let i = 0; i < code.length; i++) {
                        let rv = await parseArg(code[i], i, code.length, code, argc, stacks[currScopes[currScopes.length - 1]], initialArgs, ram, currScopes, msg, recursionC, stacks, SPAMS)
                        //@ts-ignore
                        if (rv?.end) break forever
                            //@ts-ignore
                        if (rv?.chgI) {
                            //@ts-ignore
                            i += parseInt(rv.chgI)
                        }
                        //@ts-ignore
                        if (rv?.err) {
                            return rv
                        }
                        //@ts-ignore
                        if(rv?.stack){
                            //@ts-ignore
                            stack = rv.stack
                        }
                    }
                    if (loopCount > 2000) {
                        stack.push(0)
                        break
                    }
                    let topOfStack = stack[stack.length - 1]
                    if (topOfStack instanceof Message) {
                        if (topOfStack.content == '%loopend') {
                            stack.pop()
                            break
                        }
                    }
                }
                return { chgI: chgI }
            }
            case "%if": {
                let bool = Boolean(stack.pop()) ? true : false
                if (bool) {
                    for (let i = argNo + 1; i < argCount; i++) {
                        //@ts-ignore
                        let ifCount = 0
                        if (args[i] == "%else") {
                            let ifCount = 0
                            for (let j = i + 1; j < argCount; j++) {
                                if (args[j] == '%if') {
                                    ifCount++
                                }
                                if (args[j] == "%ifend") {
                                    ifCount--
                                    if (ifCount < 0)
                                        return { chgI: j - argNo }
                                }
                            }
                            return { chgI: i - argNo }
                        }
                        else if (args[i] == "%if") {
                            ifCount++
                        }
                        else if (args[i] == "%ifend") {
                            ifCount--
                        }
                        if (args[i] == "%ifend" && ifCount < 0) {
                            return { chgI: i - argNo }
                        }
                        let rv = await parseArg(args[i], i, argCount, args, argc, stacks[currScopes[currScopes.length - 1]], initialArgs, ram, currScopes, msg, recursionC, stacks, SPAMS)
                        //@ts-ignore
                        if (rv?.end) return { end: true }
                        //@ts-ignore
                        if (rv?.chgI)
                            //@ts-ignore
                            i += parseInt(rv.chgI)
                            //@ts-ignore
                        if (rv?.err) {
                            //@ts-ignore
                            return { chgI: i - argNo, ...rv }
                        }
                        //@ts-ignore
                        if(rv?.stack){
                            //@ts-ignore
                            stack = rv.stack
                        }
                    }
                }
                else {
                    for (let i = argNo; i < argCount; i++) {
                        if (args[i] == "%else") {
                            for (let j = i + 1; j < argCount; j++) {
                                if (args[j] == "%ifend") {
                                    return { chgI: j - argNo }
                                }
                                let rv = await parseArg(args[j], j, argCount, args, argc, stacks[currScopes[currScopes.length - 1]], initialArgs, ram, currScopes, msg, recursionC, stacks, SPAMS)
                                //@ts-ignore
                                if (rv?.end) return { end: true }
                                //@ts-ignore
                                if (rv?.chgI)
                                    //@ts-ignore
                                    j += parseInt(rv.chgI)
                                    //@ts-ignore
                                if (rv?.err) {
                                    //@ts-ignore
                                    return { chgI: j - argNo, ...rv }
                                }
                                //@ts-ignore
                                if(rv?.stack){
                                    //@ts-ignore
                                    stack = rv.stack
                                }
                            }
                        }
                        if (args[i] == "%ifend") {
                            return { chgI: i - argNo }
                        }
                    }
                }
                break
            }
            default: {
                if (arg.match(/^\.[^ ]+$/)) {
                    let data = stack.pop()
                    if (typeof data === 'undefined') {
                        return { err: true, content: `${data} is undefined` }
                    }
                    let val = (data as any)[arg.slice(1)]
                    if (typeof val === 'function') {
                        stack.push(String(val))
                    }
                    else if (val) {
                        stack.push(val)
                    }
                    else {
                        stack.push(0)
                    }
                }
                else if (!isNaN(parseFloat(arg))) {
                    stack.push(parseFloat(arg))
                }
                else if (stack[stack.length - 1] == "%saveas") {
                    stack.pop()
                    let ans = stack.pop()
                    if (typeof ans === 'undefined') {
                        return { err: true, content: `Cannot save undefined as variable` }
                    }
                    vars["__global__"][arg] =  ans
                    stack.push(ans)
                }
                else if (stack[stack.length - 1] == '%lvar') {
                    let value = getVar(msg, arg)
                    if (typeof value === 'undefined') {
                        value = getVar(msg, arg, msg.author.id)
                    }
                    if (typeof value === 'undefined') {
                        return { content: `var: **${arg}** does not exist`, err: true }
                    }
                    stack.push(value)
                }
                else if (stack[stack.length - 1] == "%sram") {
                    let sram = stack.pop()
                    let item = stack.pop()
                    //@ts-ignore
                    ram[arg as string] = item
                }
                else if (stack[stack.length - 1] == '%lram') {
                    if (ram[arg] === undefined) {
                        return { content: `${arg} not in ram` }
                    }
                    stack.pop()
                    stack.push(ram[arg])
                }
                else {
                    let value = ram[arg]
                    if (typeof value === 'undefined')
                        value = getVar(msg, arg)
                    if (typeof value === 'undefined') {
                        value = getVar(msg, arg, msg.author.id)
                    }
                    if(arg.startsWith('"') && arg.endsWith('"')){
                        value = arg.slice(1, -1)
                    }
                    if (typeof value === 'undefined') {
                        return { content: `var: **${arg}** does not exist`, err: true }
                    }
                    stack.push(value)
                }
            }
        }
        return {stack: stack}
    }

async function parse(args: ArgumentList, useStart: boolean, msg: Message, SPAMS: {[key: string]: boolean}): Promise<stackTypes[] | errType | stackTypes>{
    let stacks: { [key: string]: stackTypes[] } = { __main__: [] }
    let currScopes = ["__main__"]
    let stack = stacks["__main__"]
    let initialArgs: string[] = []
    args = args.join(" ").split(/\s+/)
    if (useStart) {
        let curArg;
        while ((curArg = args.shift()) !== "%start") {
            if (curArg !== undefined)
                initialArgs.push(curArg)
            else break
        }
    }
    let argc = initialArgs.length
    let ram: { [key: string]: number | string | Message | GuildMember | Function } = {
        true: 1,
        false: 0,
        NaN: NaN,
        Infinity: Infinity,
        rec: async () => recursionC,
        "random": async (low: number, high: number) => { low ??= 1; high ??= 10; return Math.random() * (high - low) + low },
        "input": async (prompt?: string, useFilter?: boolean | string | number, reqTimeout?: number) => {
            if (prompt && typeof prompt === 'string') {
                await msg.channel.send(prompt)
            }
            let filter: CollectorFilter<[Message<boolean>]> | undefined = (m: any) => m.author.id === msg.author.id && !m.author.bot
            if (useFilter === false || useFilter === 0) {
                filter = m => !m.author.bot
            }
            else if (typeof useFilter === 'string') {
                filter = (m: any) => m.author.id === useFilter && !m.author.bot
            }
            let timeout = 30000
            if (typeof reqTimeout === 'number') {
                timeout = reqTimeout * 1000
            }
            try {
                let collected = await msg.channel.awaitMessages({ filter: filter, max: 1, time: timeout, errors: ["time"] })
                let resp = collected.at(0)
                if (typeof resp === 'undefined') {
                    return 0
                }
                return resp
            }
            catch (err) {
                return 0
            }
        }
    }
    let stacklArgs = []
    let text = args.join(" ")
    let word = ""
    let inStr = false
    let escapeStr = false
    for (let i = 0; i < text.length; i++) {
        if(text[i] == "\\" && inStr){
            escapeStr = true
            continue
        }
        else if(inStr && escapeStr){
            escapeStr = false
        }
        else if (text[i] == '"' && !escapeStr) {
            word += '"'
            inStr = !inStr
            continue
        }
        else if (text[i].match(/\s/) && !inStr) {
            stacklArgs.push(word)
            word = ""
            continue
        }
        word += text[i]
    }
    if (word)
        stacklArgs.push(word)
    args = stacklArgs.filter(a => a ? true : false)
    console.log(args)
    let recursionC = 0

    for (let i = 0; i < args.length; i++) {
        let arg = args[i]
        arg = arg.trim()
        let rv = await parseArg(arg, i, args.length, args, argc, stacks[currScopes[currScopes.length - 1]], initialArgs, ram, currScopes, msg, recursionC, stacks, SPAMS)
            //@ts-ignore
        if (rv?.end) break
            //@ts-ignore
        if (rv?.chgI)
            //@ts-ignore
            i += parseInt(rv.chgI)
            //@ts-ignore
        if (rv?.err) {
            return rv
        }
        //@ts-ignore
        if(rv?.stack){
            //@ts-ignore
            stack = rv.stack
        }
    }
    return stack
}

export{
    parse
}
