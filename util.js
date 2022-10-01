const {execFileSync} = require('child_process')
const { userVars, vars } = require("./common.js")
const vm = require('vm')
const fs = require('fs')

class UTF8String{
    constructor(text){
        this.text = [...text]
    }
    toString(){
        return this.text.join("")
    }
    length(){
        return this.text.length
    }
}

function* cycle(iter, onNext){
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

function mulStr(str, amount){
    let ans = ""
    for(let i = 0; i < amount; i++){
	ans += str
    }
    return ans
}

async function fetchChannel(guild, find){
    let channels = await guild.channels.fetch()
    let channel = channels.filter(channel => `<#${channel?.id}>` == find || channel?.id == find || channel?.name == find || channel?.name?.indexOf(find) > -1).at(0)
    return channel
}

async function fetchUser(guild, find){
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
            user = null
        }
    }
    if(!user){
        user = (await guild.members.list()).filter(u => u.id == find || u.username?.indexOf(find) > -1 || u.nickName?.indexOf(find) > -1)?.at(0)
        if(user?.size < 1){
            user = null
        }
    }
    return user
}

function generateFileName(cmd, userId){
    return `${cmd}::${userId}.txt`
}

function downloadSync(url){
    return execFileSync(`curl`, ['--silent', url])
}

function format(str, formats, doPercent, doBraces){
    if(doBraces === undefined) doBraces = true
    if(doPercent === undefined) doPercent = true
    for(let fmt in formats){
        if(fmt.length > 1){
            str = str.replaceAll(`{${fmt}}`, formats[fmt])
        }
        else str = str.replaceAll(new RegExp(`((?<!%)%${fmt}|(?<!\\\\)\\{${fmt}\\})`, "g"), formats[fmt])
    }
    return str
}

async function createGradient(gradient, width, height){
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

function rgbToHex(r, g, b){
    let [rhex, ghex, bhex] = [r.toString(16), g.toString(16), b.toString(16)]
    return `#${rhex.length == 1 ? "0" + rhex : rhex}${ghex.length == 1 ? "0" + ghex : ghex}${bhex.length == 1 ? "0" + bhex : bhex}`
}

function safeEval (code, context, opts) {
  let sandbox = {}

  let resultKey = 'SAFE_EVAL_' + Math.floor(Math.random() * 1000000)
  sandbox[resultKey] = {}
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
  if (context) {
    Object.keys(context).forEach(function (key) {
      sandbox[key] = context[key]
    })
  }
    try{
      vm.runInNewContext(code, sandbox, opts)
      return sandbox[resultKey]
    }
    catch(err){
        console.log(err)
        return undefined
    }
}

function escapeShell(text){
    return text.replaceAll(/\$/g, "\\$").replaceAll(";", "\\;")
}

function strlen(text){
    return [...text].length
}

function cmdCatToStr(cat){
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

function getImgFromMsgAndOpts(opts, msg) {
    let img = opts['img']
    if (msg.attachments?.at(0)) {
        img = msg.attachments.at(0)?.attachment
    }
    //@ts-ignore
    else if (msg.reply?.attachments?.at(0)) {
        //@ts-ignore
        img = msg.reply.attachments.at(0)?.attachment
    }
    else if (msg.embeds?.at(0)?.image?.url) {
        img = msg.embeds?.at(0)?.image?.url
    }
    else if (!img) {
        img = msg.channel.messages.cache.filter((m) => m.attachments?.last()?.size ? true : false)?.last()?.attachments?.first()?.attachment
    }
    return img
}

function getOpts(args) {
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

async function handleSending(msg, rv) {
    if (!Object.keys(rv).length) {
        return
    }
    if (rv.deleteFiles === undefined) {
        rv.deleteFiles = true
    }
    if (rv.delete && msg.deletable) {
        msg.delete().catch(_err => console.log("Message not deleted"))
    }
    if (rv.noSend) {
        return
    }
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
        delete rv['content']
    }
    else {
        if (userVars[msg.author.id]) {
            userVars[msg.author.id][`_!`] = () => rv.content
        }
        else
            userVars[msg.author.id] = { "_!": () => rv.content }
        vars[`_!`] = () => rv.content
    }
    let location = msg.channel
    if (rv['dm']) {
        location = msg.author
    }
    try {
        await location.send(rv)
    }
    catch (err) {
        console.log(err)
        await location.send("broken")
    }
    if (rv.files) {
        for (let file of rv.files) {
            if (file.delete !== false && rv.deleteFiles)
                fs.rmSync(file.attachment)
        }
    }
}

module.exports = {
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
    handleSending
}

