const {execFileSync} = require('child_process')
const vm = require('vm')

function randomColor(){
    let colors = []
    for(let i = 0; i < 3; i++){
        colors.push(Math.floor(Math.random() * 256))
    }
    return colors
}

function mulString(str, amount){
    let ans = ""
    for(let i = 0; i < amount; i++){
	ans += str
    }
    return ans
}

async function fetchUser(guild, find){
    let res;
    if(res = find?.match(/<@!?(\d{18})>/)){
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
	return undefined
    }
}

module.exports = {
    fetchUser: fetchUser,
    generateFileName: generateFileName,
    downloadSync: downloadSync,
    format: format,
    createGradient: createGradient,
    applyJimpFilter: applyJimpFilter,
    randomColor: randomColor,
    rgbToHex: rgbToHex,
    safeEval: safeEval,
    mulStr: mulString
}
