import { Client, Guild, Message } from "discord.js"

const {execFileSync} = require('child_process')
const { vars, setVar } = require("./common.js")
const vm = require('vm')
const fs = require('fs')

class UTF8String{
    text: string[]
    constructor(text: string){
        this.text = [...text]
    }
    toString(){
        return this.text.join("")
    }
    length(){
        return this.text.length
    }
}

function* cycle(iter: any, onNext: Function){
    for(let i = 0; true; i++){
	onNext(i)
	yield iter[i % iter.length]
    }
}

function randomColor(){
    let colors = []
    for(let i = 0; i < 3; i++){
        colors.push(Math.floor(Math.random() * 256))
    }
    return colors
}

function mulStr(str: string, amount: number){
    let ans = ""
    for(let i = 0; i < amount; i++){
	ans += str
    }
    return ans
}

async function fetchChannel(guild: Guild, find: string){
    let channels = await guild.channels.fetch()
    let channel = channels.filter(channel => `<#${channel?.id}>` == find || channel?.id == find || channel?.name == find || channel?.name?.indexOf(find) > -1).at(0)
    return channel
}

async function fetchUserFromClient(client: Client, find: string){
    if(!client.guilds.cache.at(0)){
        return undefined
    }
    return await fetchUser(client.guilds.cache.at(0) as Guild, find)
}

async function fetchUser(guild: Guild, find: string){
    let res;
    if(res = find?.match(/<@!?(\d{18})>/)){
        find = res[1]
    }
    await guild.members.fetch()
    let user = (await guild.members.search({query: find}))?.at(0)
    if(!user){
        try{
            user = await guild.members.fetch({user: find})
        }
        catch(DiscordAPIError){
            user = undefined
        }
    }
    if(!user){
        user = (await guild.members.list()).filter(u => u.id == find || u.user.username?.indexOf(find) > -1 || (u.nickname?.indexOf(find) || -1) > -1)?.at(0)
    }
    return user
}

function generateFileName(cmd: string, userId: string){
    return `${cmd}::${userId}.txt`
}

function downloadSync(url: string){
    return execFileSync(`curl`, ['--silent', url])
}

function escapeRegex(str: string){
    let finalString = ""
    let escaped = false
    for(let char of str){
        if(escaped){
            finalString += char
        }
        else if(char === "\\"){
            escaped = true
            finalString += "\\"
        }
        else if("^*+[]{}()$".includes(char)){
            finalString += `\\${char}`
        }
        else{
            finalString += char
        }
    }
    return finalString
}

function format(str: string, formats: {[key: string]: string}, doPercent?: boolean, doBraces?: boolean){
    if(doBraces === undefined) doBraces = true
    if(doPercent === undefined) doPercent = true
    for(let fmt in formats){
        if(fmt.length > 1){
            str = str.replaceAll(`{${fmt}}`, formats[fmt])
        }
        else{
            let unescaped = fmt
            fmt = escapeRegex(fmt)
            str = str.replaceAll(new RegExp(`((?<!%)%${fmt}|(?<!\\\\)\\{${fmt}\\})`, "g"), formats[unescaped])
        }
    }
    return str
}

async function createGradient(gradient: string[], width: number | string, height: number | string){
    let gradientSvg = "<linearGradient id=\"gradient\">"
    let styleSvg = "<style type=\"text/css\"><![CDATA[#rect{fill: url(#gradient);}"
    let colorStep = 1 / (gradient.length - 1)
    for(let i = 0; i < gradient.length; i++){
	let grad = gradient[i]
	gradientSvg += `<stop class="stop${i}" offset="${i*colorStep*100}%" />`
	styleSvg += `.stop${i}{stop-color: ${grad};}`
    }
    styleSvg += "]]></style>"
    gradientSvg += "</linearGradient>"

    let svg = Buffer.from(`<svg>
		    <defs>
			${gradientSvg}
			${styleSvg}
		    </defs>
		    <rect id="rect" x="0" y="0" width="${width}" height="${height}" />
		</svg>`)
    return svg
}

//@ts-ignore
async function applyJimpFilter(img, filter, arg){
    switch(filter){
        case "rotate":
            let deg, resize
            if(arg?.length)
                [deg, resize] = arg.split(",")
            deg = parseFloat(deg) || 90.0
            resize = resize ?? true
            if(resize=="false")
                resize = false
            return img.rotate(deg, resize)
        case "flip":
            let hor, vert
            if(arg){
                if(arg == "horizontal" || arg == "hor"){
                    hor = true
                    vert = false
                }
                else if(arg == 'vertical' || arg == "vert"){
                    hor = false
                    vert = true
                }
            } else {
                hor = true
                vert = false
            }
            return img.flip(hor, vert)
        case "brightness":{
            let val = parseInt(arg) || .5
            return img.brightness(val)
        }
        case "grey":
        case "greyscale":
        case "gray":
        case "grayscale":
            return img.greyscale()
        case "invert":
            return img.invert()
        case "contrast":{
            let val = parseInt(arg) || .5
            return img.contrast(val)
        }
        default:
            return img
    }
}

function rgbToHex(r: number, g: number, b: number){
    let [rhex, ghex, bhex] = [r.toString(16), g.toString(16), b.toString(16)]
    return `#${rhex.length == 1 ? "0" + rhex : rhex}${ghex.length == 1 ? "0" + ghex : ghex}${bhex.length == 1 ? "0" + bhex : bhex}`
}

function generateSafeEvalContextFromMessage(msg: Message){
    return { uid: msg.member?.id, uavatar: msg.member?.avatar, ubannable: msg.member?.bannable, ucolor: msg.member?.displayColor, uhex: msg.member?.displayHexColor, udispname: msg.member?.displayName, ujoinedAt: msg.member?.joinedAt, ujoinedTimeStamp: msg.member?.joinedTimestamp, unick: msg.member?.nickname, ubot: msg.author.bot }
}

function safeEval (code: string, context: {[key: string]: any}, opts: any) {
  let sandbox = {}

  let resultKey = 'SAFE_EVAL_' + Math.floor(Math.random() * 1000000)
  //@ts-ignore
  sandbox[resultKey] = {}
  //@ts-ignore
  sandbox["Buffer"] = Buffer
  let clearContext = `
    (function() {
      Function = undefined;
      const keys = Object.getOwnPropertyNames(this).concat(['constructor']);
      keys.forEach((key) => {
        const item = this[key];
        if (!item || typeof item.constructor !== 'function') return;
        this[key].constructor = undefined;
      });
    })();
  `
  code = clearContext + resultKey + '=' + code
  if(!context){
      context = {}
  }
  context = {yes: true, no: false, rgbToHex, escapeRegex, escapeShell, randomColor, mulStr, ...context}
  if (context) {
    Object.keys(context).forEach(function (key) {
        //@ts-ignore
      sandbox[key] = context[key]
    })
  }
    try{
      vm.runInNewContext(code, sandbox, opts)
      //@ts-ignore
      return sandbox[resultKey]
    }
    catch(err){
        console.log(err)
        return undefined
    }
}

function escapeShell(text:  string){
    return text.replaceAll(/\$/g, "\\$").replaceAll(";", "\\;")
}

function strlen(text: string){
    return [...text].length
}

function cmdCatToStr(cat: number){
    switch(cat){
        case 0:
            return "util"
        case 1:
            return "game"
        case 2:
            return "fun"
        case 3:
            return "meta"
        case 4:
            return "images"
    }
}

function getImgFromMsgAndOpts(opts: Opts, msg: Message) {
    let img = opts['img']
    if (msg.attachments?.at(0)) {
        //@ts-ignore
        img = msg.attachments.at(0)?.attachment
    }
    //@ts-ignore
    else if (msg.reply?.attachments?.at(0)) {
        //@ts-ignore
        img = msg.reply.attachments.at(0)?.attachment
    }
    else if (msg.embeds?.at(0)?.image?.url) {
        //@ts-ignore
        img = msg.embeds?.at(0)?.image?.url
    }
    else if (!img) {
        //@ts-ignore
        img = msg.channel.messages.cache.filter((m) => m.attachments?.last()?.size ? true : false)?.last()?.attachments?.first()?.attachment
    }
    return img
}

function getOpts(args: ArgumentList) {
    let opts = {}
    let newArgs = []
    let idxOfFirstRealArg = 0
    for (let arg of args) {
        idxOfFirstRealArg++
        if (arg[0] == "-") {
            if (arg[1] && arg[1] === '-') {
                break
            }
            if (arg[1]) {
                let [opt, ...value] = arg.slice(1).split("=")
                //@ts-ignore
                opts[opt] = value[0] == undefined ? true : value.join("=");
            }
        } else {
            idxOfFirstRealArg--
            break
        }
    }
    for (let i = idxOfFirstRealArg; i < args.length; i++) {
        newArgs.push(args[i])
    }
    return [opts, newArgs]
}

async function handleSending(msg:  Message, rv: CommandReturn) {
    if (!Object.keys(rv).length) {
        return
    }
    //by default delete files that are being sent from local storage
    if (rv.deleteFiles === undefined) {
        rv.deleteFiles = true
    }
    if (rv.delete && msg.deletable) {
        msg.delete().catch(_err => console.log("Message not deleted"))
    }
    if (rv.noSend) {
        return
    }
    //if the content is > 2000 (discord limit), send a file instead
    if ((rv.content?.length || 0) >= 2000) {
        fs.writeFileSync("out", rv.content)
        delete rv["content"]
        if (rv.files) {
            rv.files.push({ attachment: "out", name: "cmd.txt", description: "command output too long" })
        } else {
            rv.files = [{
                attachment: "out", name: "cmd.txt", description: "command output too long"
            }]
        }
    }
    if (!rv?.content) {
        //if content is empty string, delete it so it shows up as undefined to discord, so it wont bother trying to send an empty string
        delete rv['content']
    }
    else {
        //if not empty, save in the _! variable
        setVar("_!", rv.content, msg.author.id)
        setVar("_!", rv.content)
    }
    //the place to send message to
    let location = msg.channel
    if (rv['dm']) {

        //@ts-ignore
        location = msg.author
    }
    try {
        await location.send(rv)
    }
    catch (err) {
        console.log(err)
        //usually happens when there is nothing to send
        await location.send("broken")
    }
    //delete files that were sent
    if (rv.files) {
        for (let file of rv.files) {
            if (file.delete !== false && rv.deleteFiles)
                fs.rmSync(file.attachment)
        }
    }
}

export {
    fetchUser,
    fetchChannel,
    generateFileName,
    downloadSync,
    format,
    createGradient,
    applyJimpFilter,
    randomColor,
    rgbToHex,
    safeEval,
    mulStr,
    cycle,
    escapeShell,
    strlen,
    UTF8String,
    cmdCatToStr,
    getImgFromMsgAndOpts,
    getOpts,
    handleSending,
    fetchUserFromClient,
    generateSafeEvalContextFromMessage
}

