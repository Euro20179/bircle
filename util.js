import { DiscordAPIError } from "discord.js";
import {execFileSync} from 'child_process'

function randomColor(){
    let colors = []
    for(let i = 0; i < 3; i++){
        colors.push(Math.floor(Math.random() * 256))
    }
    return colors
}

async function fetchUser(guild, find){
    let res;
    if(res = find.match(/<@!?(\d{18})>/)){
        find = res[1]
    }
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

async function createGradient(gradient, gradientAngle, x, y, width, height, msg, ctx){
    let grad = ctx.createLinearGradient(x, y, (Math.cos(gradientAngle) * width) + x, (Math.sin(gradientAngle) * height) + y)
    let colorStep = 1 / (gradient.length - 1)
    for(let i = 0; i < gradient.length; i++){
        try{
            grad.addColorStop(i * colorStep, gradient[i])
        }
        catch(err){
            await msg.channel.send(`${gradient[i]} is not a color`)
        }
    }
    return grad
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

export{
    fetchUser,
    generateFileName,
    downloadSync,
    format,
    createGradient,
    applyJimpFilter,
    randomColor,
    rgbToHex,
}
