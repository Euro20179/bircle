import fs from 'fs'
import canvas from 'canvas'
import https from 'https'

import fetch = require("node-fetch")

import { Stream } from 'stream'

import { CommandCategory, createCommand, createHelpArgument, createHelpOption, handleSending, registerCommand, StatusCode } from './common_to_commands'
import { createGradient, cycle, generateFileName, getImgFromMsgAndOpts, getOpts, intoColorList, Pipe, randomColor, rgbToHex } from './util'
import { parsePosition } from './parsing'
import { getVar, prefix } from './common'
import { Message } from 'discord.js'
import sharp = require('sharp')

export default function() {
    registerCommand(
        "img-diff",
        {
            run: async (msg, args) => {
                let [img1, img2] = args
                if (!img1 || !img2) {
                    return { content: "Must provide 2 image links", status: StatusCode.ERR }
                }
                let image1 = await canvas.loadImage(img1 as string)
                if (image1.width * image1.height > 1000000) {
                    return { content: "Image 1 is too large", status: StatusCode.ERR }
                }
                let canv = new canvas.Canvas(image1.width, image1.height)
                let ctx = canv.getContext("2d")
                ctx.drawImage(image1, 0, 0)
                let data1 = ctx.getImageData(0, 0, canv.width, canv.height)

                let image2 = await canvas.loadImage(img2 as string)
                canv = new canvas.Canvas(image1.width, image1.height)
                ctx = canv.getContext("2d")
                ctx.scale(image1.width / image2.width, image1.height / image2.height)
                ctx.drawImage(image2, 0, 0)
                let data2 = ctx.getImageData(0, 0, canv.width, canv.height)
                if (image2.width * image2.height > 1000000) {
                    return { content: "Image 2 is too large", status: StatusCode.ERR }
                }

                let diffData = data1.data.map((v, idx) => {
                    let mod = idx % 4 == 3
                    //@ts-ignore
                    return (mod * 255) + (Math.abs(v - (data2.data.at(idx) ?? v)) * (mod ^ 1))
                })

                //console.log(diffData)
                ctx.putImageData(new canvas.ImageData(diffData, data1.width, data1.height), 0, 0)
                let fn = `${generateFileName("img-diff", msg.author.id)}.png`
                fs.writeFileSync(fn, canv.toBuffer())
                return {
                    files: [
                        {
                            attachment: fn,
                            name: fn,
                            delete: true
                        }
                    ],
                    status: StatusCode.RETURN
                }
            }, category: CommandCategory.IMAGES,
            help: {
                info: "Creatte an image that is the result of the difference of 2 images",
                arguments: {
                    img1: createHelpArgument("Link to image", true),
                    img2: createHelpArgument("Link to 2nd imge", true, "img1")
                }
            }
        },
    )

    registerCommand(
        "picsum.photos", createCommand(async (msg, args) => {
            let opts;
            [opts, args] = getOpts(args)
            let width = parseInt(args[0]) || 100;
            let height = parseInt(args[1]) || 100;
            let data = await fetch.default(`https://picsum.photos/${width}/${height}`);
            if (data.status !== 200) {
                return { content: `picsum returned a ${data.status} error`, status: StatusCode.ERR }
            }
            if (opts['url']) {
                return { content: data.url, status: StatusCode.RETURN }
            }
            let png_fetch = await fetch.default(data.url)
            let png = await png_fetch.buffer()
            let fn = `${generateFileName("picsum.photos", msg.author.id)}.png`
            fs.writeFileSync(fn, png)
            return {
                files: [
                    {
                        attachment: fn,
                        name: `Image(${width}x${height}).png`,
                        description: `A random image with a width of ${width} and height of ${height}`,
                        delete: true
                    }
                ],
                status: StatusCode.RETURN
            }
        }, CommandCategory.IMAGES,
            "Gets an image from picsum.photos",
            {
                "width": createHelpArgument("The width of the image", false),
                "height": createHelpArgument("The height of the image", false, "width")
            },
            {
                "url": createHelpOption("Print the image url instead of giving back the image")
            }),
    )

    registerCommand(
        'invert',
        {
            run: async (msg, args) => {
                let opts;
                [opts, args] = getOpts(args)
                let channel = args.map(v => v.toLowerCase())
                let above = parseInt(opts['above'] as string) || 0
                let below = parseInt(opts['below'] as string) || 255
                if (!channel.length) {
                    channel = ["red", "green", "blue"]
                }
                let img = getImgFromMsgAndOpts(opts, msg)
                let image = await canvas.loadImage(img as string)
                if (image.width * image.height > 1000000) {
                    return { content: "Image is too large", status: StatusCode.ERR }
                }
                let canv = new canvas.Canvas(image.width, image.height)
                let ctx = canv.getContext("2d")
                ctx.drawImage(image, 0, 0)
                let rgba_cycle = cycle(["red", "green", "blue", "alpha"])
                let data = ctx.getImageData(0, 0, canv.width, canv.height).data.map((v, idx) => {
                    let cur_channel = rgba_cycle.next().value
                    if (idx % 4 === 3)
                        return v
                    if (channel.includes(cur_channel) && (v >= above && v <= below)) {
                        return 255 - v
                    }
                    return v
                })
                ctx.putImageData(new canvas.ImageData(data, canv.width, canv.height), 0, 0)
                let fn = `${generateFileName("img-channel", msg.author.id)}.png`
                fs.writeFileSync(fn, canv.toBuffer())
                return {
                    files: [
                        {
                            attachment: fn,
                            name: fn,
                            delete: true
                        }
                    ],
                    status: StatusCode.RETURN
                }
            }, category: CommandCategory.IMAGES,
            help: {
                arguments: {
                    channel: {
                        description: "The channel to invert, defaults to all",
                        required: false
                    }
                },
                options: {
                    "above": {
                        description: "Above what value to invert for the channel"
                    },
                    below: {
                        description: "Below what value to invert for the channel"
                    }
                }
            }
        },
    )

    registerCommand(
        "img-channel",
        {
            run: async (msg, args) => {
                let opts;
                [opts, args] = getOpts(args)
                let channel = args.map(v => v.toLowerCase())
                if (!channel.length) {
                    return { content: "No channel", status: StatusCode.ERR }
                }
                let img = getImgFromMsgAndOpts(opts, msg)
                let image = await canvas.loadImage(img as string)
                let canv = new canvas.Canvas(image.width, image.height)
                let ctx = canv.getContext("2d")
                ctx.drawImage(image, 0, 0)
                let rgba_cycle = cycle(["red", "green", "blue", "alpha"])
                let data = ctx.getImageData(0, 0, canv.width, canv.height).data.map((v, idx) => {
                    let cur_channel = rgba_cycle.next().value
                    if (idx % 4 === 3 && !channel.includes("alpha"))
                        return v
                    if (channel.includes(cur_channel)) {
                        return v
                    }
                    return 0
                })
                ctx.putImageData(new canvas.ImageData(data, canv.width, canv.height), 0, 0)
                let fn = `${generateFileName("img-channel", msg.author.id)}.png`
                fs.writeFileSync(fn, canv.toBuffer())
                return {
                    files: [
                        {
                            attachment: fn,
                            name: fn,
                            delete: true
                        }
                    ], status: StatusCode.RETURN
                }
            }, category: CommandCategory.IMAGES,
            help: {
                info: "Get a specific color channel from an image",
                arguments: {
                    channel: createHelpArgument("The channel<br><b>can be</b><ul><li>red</li><li>green</li><li>blue</li><li>alpha</li>")
                }
            }
        },
    )

    registerCommand(
        "draw", createCommand(async (msg, args, sendCallback) => {
            let opts;
            [opts, args] = getOpts(args)
            let width = Pipe.start(opts['w']).default(500).next((v: any) => String(v)).done()
            let height = Pipe.start(opts['h']).default(500).next((v: any) => String(v)).done()
            let canv = new canvas.Canvas(width, height, "image")
            let ctx = canv.getContext('2d')
            ctx.textBaseline = 'top'
            function createColor(type: string, data: string[], m: Message) {
                switch (type) {
                    // case "pattern": {
                    //     let opts: {[key: string]: string} = {};
                    //     if(data.join(" ").trim()){
                    //         opts['img'] = data.join(" ").trim()
                    //     }
                    //     let img_url = getImgFromMsgAndOpts(opts, m)
                    //     console.log(img_url)
                    //     return {color: ctx.createPattern(img_url, "repeat")}
                    // }
                    case 'lgrad':
                    case 'lgradient':
                    case 'linear': {
                        let info = data.join(" ")
                        let coords = info.split("|")[0].split(" ").map((v: string) => v.trim())
                        let x1 = parsePosition(coords[0], canv.width)
                        let y1 = parsePosition(coords[1], canv.height)
                        let x2 = parsePosition(coords[2], canv.width)
                        let y2 = parsePosition(coords[3], canv.height)
                        const grad = ctx.createLinearGradient(x1, y1, x2, y2)
                        let colors = info.split("|").slice(1).join("|").replaceAll("|", ">").split(">").map((v: string) => v.trim())
                        for (let color of colors) {
                            let [stop, ...c] = color.split(" ")
                            color = c.join(" ")
                            if (color === "rand") {
                                color = `#${randomColor().map(v => `0${v.toString(16)}`.slice(-2))}`
                            }
                            try {
                                grad.addColorStop(parseFloat(stop), color)
                            }
                            catch (err) {
                                return { err: `Could not add ${color} at stop point ${stop}` }
                            }
                        }
                        return { color: grad }
                    }
                    case 'rgrad':
                    case 'rgradient':
                    case 'radial': {
                        let info = data.join(" ")
                        let coords = info.split("|")[0].split(" ").map((v: string) => v.trim())
                        let x1 = parsePosition(coords[0], canv.width)
                        let y1 = parsePosition(coords[1], canv.height)
                        let r1 = parsePosition(coords[2], canv.width)
                        let x2 = parsePosition(coords[3], canv.width)
                        let y2 = parsePosition(coords[4], canv.height)
                        let r2 = parsePosition(coords[5], canv.width)
                        const grad = ctx.createRadialGradient(x1, y1, r1, x2, y2, r2)
                        let colors = info.split("|").slice(1).join("|").replaceAll("|", ">").split(">").map((v: string) => v.trim())
                        for (let color of colors) {
                            let [stop, ...c] = color.split(" ")
                            color = c.join(" ")
                            if (color === "rand") {
                                color = `#${randomColor().map(v => `0${v.toString(16)}`.slice(-2))}`
                            }
                            try {
                                grad.addColorStop(parseFloat(stop), color)
                            }
                            catch (err) {
                                return { err: `Could not add ${color} at stop point ${stop}` }
                            }
                        }
                        return { color: grad }
                    }
                    case 'solid': {
                        return { color: data.join(" ") }
                    }
                    default: {
                        if (data.length) {
                            return { color: type + data.join(" ") }
                        }
                        return { color: type }
                    }
                }
            }
            draw_loop: while (true) {
                let m;
                try {
                    m = await msg.channel.awaitMessages({ filter: m => m.author.id == msg.author.id, max: 1, time: 120000 })
                }
                catch (err) {
                    let fn = `${generateFileName("draw", msg.author.id)}.png`
                    fs.writeFileSync(fn, canv.toBuffer())
                    return {
                        files: [
                            {
                                attachment: fn,
                                name: fn,
                                delete: true
                            }
                        ],
                        status: StatusCode.RETURN
                    }
                }
                let actionMessage = m.at(0)
                if (!actionMessage) {
                    break
                }
                let action = actionMessage.content.split(" ")[0]
                let args = actionMessage.content.split(" ").slice(1)
                switch (action) {
                    case "help": {
                        await handleSending(msg, {
                            status: StatusCode.INFO, content: `
COLOR TYPES:
    #rgb
    #rrggbb
    #rrggbbaa
    rgb(r, g, b)
    rgba(r, g, b, a)
    hsl(h, s, l)
    hsla(h, s, l, a)
    <html color name>
    lgradient <x1> <y1> <x2> <y2> | <stop1> <css-color> > <stop2> <css-color2> > ...
        (<x1>, <y1>) is the start of the gradient, (<x2>, <y2>) is the end
        the stops must be a percentage 0-1
        css-color must be a basic css-color as listed above
    rgradient <x1> <y1> <r1> <x2> <y2> <r2> | <stop1> <css-color> > <stop2> <css-color2> > ...
        I honestly could not tell you how radial gradients work

COMMANDS:

**done**: end drawing
**no** <type>:
    set <type> back to default
    values for type:
        shadow
        color
        text-align
        text-baseline
        outline

**start-path** | **path** | **begin-path** | **begin-stroke** :
    begin a path

**end-path** | **stroke** | **end-stroke**:
    end a path

**fill** | **fill-stroke**:
    end a path and fill it

**goto** | **move-to** <x> <y>:
    change the current position to (<x>, <y>)
**image** <dx> <dy> [dw [dh [sx [sy [sw [sh]]]]]] | <image>:
    put the area: (<sx>, <sy>) through (<sx + sw>, <sy + sh>) <image> on the canvas at (<dx>, <dy>) with a width of (<dw>, <dh>)

**shadow** [xo [yo [blur [color]]]]:
    set shadowOffsetX to <xo> or 0
    set shadowOffsetY to <yo> or 0
    set shadowBlur to <blur> or 0
    set shadowColor to <color> or red

**shadow-color** <color>:
    set shadowColor to a basic css color

**shadow-x** <x>:
    set shadowOffsetY to <x>

**shadow-y** <y>:
    set shadowOffsetY to <y>

**shadow-blur** <blur>:
    set shadowBlur to <blur>

**outline** | **stroke** [color]:
    set the stroke style (outline color) to [color] or red
    see COLOR TYPES for types of colors

**outline-width** | **line-width** | **stroke-width** <width>:
    set the outline width to <width>

**outline-type** | **line-type** | **stroke-type** <style>:
    set the line type to <style>
    style can be:
        round
        bevel
        miter

**color** <color>:
    set the fill color to <color>
    see COLOR TYPES for types of colors

**font** [size]:
**font** [font]:
**font** [size] [font]:
    sets the font size to [size], and the font to [font]
    for a list of fonts, run ${prefix}api getFonts

**text-align** <alignment>:
    alignment can be:
        left
        right
        center
        start
        end

**text-baseline** [baseline]:
    sets the text baseline to [baseline] or top
    baseline can be:
        top
        hanging
        middle
        alphabet
        ideographic
        bottom

**stroke-text** | **stext** <x> <y> <text>:
    Put an outline of <text> at <x> <y>

**text** <x> <y> <text>:
    Put <text> at (<x>, <y>)

**box** <x> <y> <w> <h>:
    draw an outline of a box at (<x>, <y>) with a width of <w> and height of <h>

**rect** <x> <y> <w> <h>:
    put a rectangle at (<x>, <y>) with a width of <w> and height of <h>

**fill-screen** [color]:
    fill the screen with color
    see COLOR TYPES for types of colors

**orect** <x> <y> <w> <h>:
    put an outlined rectangle at (<x>, <y>) with a width of <w> and height of <h>

**rotate** <angle (degrees)>:
    rotate the canvas by <angle>

The commands below, only work after **path** has been run:

    **line-to** <x> <y>:
        draw a line starting from the current position, and going to (<x>, <y>)

    **arc** <x> <y> <r> [start-angle [end-angle]]:
        create an arc at (<x>, <y>) with radius <r>

`}, sendCallback)
                        continue;
                    }
                    case "done": {//{{{
                        break draw_loop
                    }//}}}
                    case "no": {//{{{
                        let type = args[0]
                        switch (type) {
                            case "shadow-color":
                            case "shadow": {
                                ctx.shadowColor = "transparent"
                                break
                            }
                            case "color": {
                                ctx.fillStyle = "transparent"
                                break
                            }
                            case "text-align": {
                                ctx.textAlign = "start"
                                break
                            }
                            case "text-baseline":
                            case "baseline": {
                                ctx.textBaseline = "top"
                                break
                            }
                            case "outline": {
                                ctx.strokeStyle = "transparent"
                                break;
                            }
                        }
                        continue
                    }//}}}
                    case "start-path"://{{{
                    case "path":
                    case "begin-path":
                    case "begin-stroke": {
                        ctx.beginPath()
                        continue
                    }//}}}
                    case "end-path"://{{{
                    case "stroke":
                    case "end-stroke": {
                        ctx.stroke()
                        break
                    }//}}}
                    case "fill"://{{{
                    case "fill-stroke": {
                        ctx.fill()
                        break
                    }//}}}
                    case "line-to": {//{{{
                        let [str_x, str_y] = args
                        let x = parsePosition(str_x, canv.width)
                        let y = parsePosition(str_y, canv.height)
                        ctx.lineTo(x, y)
                        continue
                    }//}}}
                    case "goto"://{{{
                    case "move-to": {
                        let [str_x, str_y] = args
                        let x = parsePosition(str_x, canv.width)
                        let y = parsePosition(str_y, canv.height)
                        ctx.moveTo(x, y)
                        continue
                    }//}}}
                    case "arc": {//{{{
                        let [str_x, str_y, str_r, str_sa, str_ea] = args
                        let r = parsePosition(str_r, canv.width / 2)
                        let x = parsePosition(str_x, canv.width, r)
                        let y = parsePosition(str_y, canv.height, r)
                        let start_angle = parseFloat(str_sa) || 0
                        let end_angle = parseFloat(str_ea) || 2 * Math.PI
                        ctx.arc(x, y, r, start_angle * (Math.PI / 180), end_angle)
                        continue
                    }//}}}
                    case "image": {//{{{{{{
                        let [args_str, image] = args.join(" ").split("|")
                        args = args_str.split(" ")
                        let [str_dx, str_dy, str_dw, str_dh, str_sx, str_sy, str_sw, str_sh] = args
                        let opts: any = {};
                        if (image?.trim()) {
                            opts['img'] = image.trim()
                        }
                        image = getImgFromMsgAndOpts(opts, actionMessage) as string
                        let canv_img = await canvas.loadImage(image as string)
                        let dx = parsePosition(str_dx || "0", canv.width)
                        let dy = parsePosition(str_dy || "0", canv.height)
                        let dw = parsePosition(str_dw || `${canv.width}`, canv.width)
                        let dh = parsePosition(str_dh || `${canv.height}`, canv.height)
                        let sx = parsePosition(str_sx || "0", canv_img.width)
                        let sy = parsePosition(str_sy || "0", canv_img.height)
                        let sw = parsePosition(str_sw || `${canv_img.width}`, canv_img.width)
                        let sh = parsePosition(str_sh || `${canv_img.height}`, canv_img.height)
                        ctx.drawImage(canv_img, sx, sy, sw, sh, dx, dy, dw, dh)
                        break

                    }//}}}}}}
                    case "shadow": {//{{{
                        let [str_xo, str_yo, str_blur, color] = args
                        ctx.shadowOffsetX = parseFloat(str_xo) || 0
                        ctx.shadowOffsetY = parseFloat(str_yo) || 0
                        ctx.shadowBlur = parseFloat(str_blur) || 0
                        ctx.shadowColor = color || "red"
                        continue
                    }//}}}
                    case "shadow-color": {//{{{
                        ctx.shadowColor = args.join(" ").trim()
                        continue
                    }//}}}
                    case "shadow-blur": {//{{{
                        ctx.shadowBlur = parseFloat(args.join(" "))
                        continue
                    }//}}}
                    case "shadow-x": {//{{{
                        ctx.shadowOffsetX = parseFloat(args.join(" "))
                        continue
                    }
                    case "shadow-y": {
                        ctx.shadowOffsetY = parseFloat(args.join(" "))
                        continue
                    }//}}}
                    case "stroke"://{{{
                    case "outline": {
                        let type = args[0]
                        let { color, err } = createColor(type, args.slice(1), actionMessage)
                        if (err) {
                            await handleSending(msg, { status: StatusCode.ERR, content: err }, sendCallback)
                        }
                        ctx.strokeStyle = color ?? "red"
                        continue
                    }//}}}
                    case "outline-width"://{{{
                    case "line-width":
                    case "stroke-width": {
                        ctx.lineWidth = parseFloat(args.join(" "))
                        continue
                    }//}}}
                    case "outline-type"://{{{
                    case "line-type":
                    case "stroke-type": {
                        ctx.lineJoin = args.join(" ") as CanvasLineJoin
                        continue
                    }//}}}
                    case "color": {//{{{
                        let type = args[0]
                        let { color, err } = createColor(type, args.slice(1), actionMessage)
                        if (err) {
                            await handleSending(msg, { content: err, status: StatusCode.ERR }, sendCallback)
                            continue
                        }
                        ctx.fillStyle = color ?? "red"
                        continue
                    }//}}}
                    case 'font': {//{{{
                        let [size, ...font] = args
                        let font_name = font.join(" ") || ctx.font.split(" ")[1].trim() || "serif"
                        let trueSize = parseFloat(size)
                        if (!trueSize) {
                            font_name = size + font_name
                            trueSize = 50
                        }
                        ctx.font = `${trueSize}px ${font_name}`
                        continue
                    }//}}}
                    case 'text-align': {//{{{
                        ctx.textAlign = args.join(" ") as CanvasTextAlign
                        continue
                    }//}}}
                    case 'text-baseline': {//{{{
                        try {
                            //@ts-ignore
                            ctx.textBaseline = args.join(" ")
                        }
                        catch (err) {
                            ctx.textBaseline = 'top'
                        }
                        continue
                    }//}}}
                    case 'stroke-text'://{{{
                    case 'stext': {
                        let [strx, stry, ...text] = args
                        let textInfo = ctx.measureText(text.join(" "))
                        let font_size = parseFloat(ctx.font)
                        let [x, y] = [parsePosition(strx, canv.width, textInfo.width), parsePosition(stry, canv.height, font_size * (72 / 96) + textInfo.actualBoundingBoxDescent)]
                        ctx.strokeText(text.join(" ").replaceAll("\\n", "\n"), x, y)
                        break;
                    }//}}}
                    case 'text': {//{{{
                        let [strx, stry, ...text] = args
                        let textInfo = ctx.measureText(text.join(" "))
                        let font_size = parseFloat(ctx.font)
                        let [x, y] = [parsePosition(strx, canv.width, textInfo.width), parsePosition(stry, canv.height, font_size * (72 / 96) + textInfo.actualBoundingBoxDescent)]
                        ctx.fillText(text.join(" ").replaceAll("\\n", "\n"), x, y)
                        break;
                    }//}}}
                    case 'box': {//{{{
                        let [str_x, str_y, str_w, str_h] = args
                        if (!str_x) str_x = "0";
                        if (!str_y) str_y = "0";
                        if (!str_w) str_w = String(canv.width);
                        if (!str_h) str_h = String(canv.height);
                        let x, y, w, h
                        w = parsePosition(str_w, canv.width - ctx.lineWidth)
                        h = parsePosition(str_h, canv.width - ctx.lineWidth)
                        x = parsePosition(str_x, canv.width, w - ctx.lineWidth / 2)
                        y = parsePosition(str_y, canv.height, h - ctx.lineWidth / 2)
                        ctx.strokeRect(x, y, w, h)
                        break
                    }//}}}
                    case "fill-screen": {//{{{
                        let type = args[0]
                        if (type) {
                            let { color, err } = createColor(type, args.slice(1), actionMessage)
                            if (err) {
                                await handleSending(msg, { content: err, status: StatusCode.ERR }, sendCallback)
                                continue
                            }
                            ctx.fillStyle = color ?? "red"
                        }
                        ctx.fillRect(0, 0, canv.width, canv.height)
                        break
                    }//}}}
                    case "rect": {//{{{
                        let [str_x, str_y, str_w, str_h] = args
                        if (!str_x) str_x = "0";
                        if (!str_y) str_y = "0";
                        if (!str_w) str_w = String(canv.width);
                        if (!str_h) str_h = String(canv.height);
                        let x, y, w, h
                        w = parsePosition(str_w, canv.width)
                        h = parsePosition(str_h, canv.width)
                        x = parsePosition(str_x, canv.width, w)
                        y = parsePosition(str_y, canv.height, h)

                        ctx.fillRect(x, y, w, h)
                        break;
                    }//}}}
                    case "orect": {//{{{
                        let [str_x, str_y, str_w, str_h] = args
                        if (!str_x) str_x = "0";
                        if (!str_y) str_y = "0";
                        if (!str_w) str_w = String(canv.width);
                        if (!str_h) str_h = String(canv.height);
                        let x, y, w, h
                        w = parsePosition(str_w, canv.width - ctx.lineWidth)
                        h = parsePosition(str_h, canv.width - ctx.lineWidth)
                        x = parsePosition(str_x, canv.width, w - ctx.lineWidth / 2)
                        y = parsePosition(str_y, canv.height, h - ctx.lineWidth / 2)
                        ctx.strokeRect(x, y, w, h)
                        ctx.fillRect(x + ctx.lineWidth / 2, y + ctx.lineWidth / 2, w - ctx.lineWidth, h - ctx.lineWidth)
                        break
                    }//}}}
                    case 'rotate': {//{{{
                        let angle = parseFloat(args.join(" "))
                        ctx.rotate(angle)
                        break
                    }//}}}
                    default: continue
                }
                let fn = `${generateFileName("draw", msg.author.id)}.png`
                fs.writeFileSync(fn, canv.toBuffer())
                await handleSending(msg, {
                    files: [
                        {
                            attachment: fn,
                            name: fn,
                        }
                    ], status: StatusCode.INFO
                }, sendCallback)


            }
            let fn = `${generateFileName("draw", msg.author.id)}.png`
            fs.writeFileSync(fn, canv.toBuffer())
            return {
                files: [
                    {
                        attachment: fn,
                        name: fn,
                        delete: true
                    }
                ], status: StatusCode.RETURN
            }
        }, CommandCategory.IMAGES),
    )

    registerCommand(
        "img",
        {
            run: async (_msg: Message, args: ArgumentList, sendCallback) => {
                let opts
                [opts, args] = getOpts(args)
                let gradOpt = opts['gradient']
                let gradient;
                if (typeof gradOpt == 'boolean') {
                    gradOpt = false
                } else if (gradOpt) {
                    gradient = gradOpt.split(">")
                }
                const width = Math.min(parseFloat(args[0]) || parseFloat(opts['w'] as string) || parseFloat(opts['width'] as string) || parseFloat(opts['size'] as string) || 100, 2000)
                const height = Math.min(parseFloat(args[1]) || parseFloat(opts['h'] as string) || parseFloat(opts['height'] as string) || parseFloat(opts['size'] as string) || width || 100, 2000)
                if (width < 0) {
                    return {
                        content: "Width must be > 0",
                        status: StatusCode.ERR
                    }
                }
                if (height < 0) {
                    return {
                        content: "Height must be > 0",
                        status: StatusCode.ERR
                    }
                }
                let img;
                if (gradient) {
                    img = await sharp(await createGradient(gradient, width, height)).toBuffer()
                }
                else {
                    let colorHint = args[2] || opts['color'] || "black"
                    let color = "black"
                    if (typeof colorHint !== 'boolean') {
                        color = colorHint
                    }
                    img = await sharp({
                        create: {
                            width: width,
                            height: height,
                            channels: 4,
                            background: color
                        }
                    }).png().toBuffer()
                }
                fs.writeFileSync(`./out.png`, img)
                return {
                    files: [
                        {
                            attachment: `out.png`,
                            name: `file.png`,
                            description: "why can i describe this"
                        }
                    ],
                    content: "Your image, sir",
                    status: StatusCode.RETURN
                }
            },
            help: {
                arguments: {
                    width: {
                        description: "the width of the image, max of 2000",
                        required: false
                    },
                    height: {
                        description: "the height of the image, max of 2000",
                        requires: "width"
                    },
                    color: {
                        description: "color of the image",
                        requires: "height"
                    }
                },
                options: {
                    "fmt": {
                        description: "The image format to use, can be png, or jpg, eg: -fmt=png"
                    },
                    "gradient": {
                        description: "Put a gradient instead of solid color, syntax: <code>-gradient=color1>color2>color3...</code>"
                    },
                    "grad-angle": {
                        description: "The angle to put the gradient at in degrees"
                    },
                    "size": {
                        description: "Width, and height of the image, syntax: <code>-size=number</code>, max of 2000"
                    },
                    "height": {
                        description: "Height of the image"
                    },
                    "h": {
                        description: "Height of the image, overrides -height"
                    },
                    "width": {
                        description: "Width of the image"
                    },
                    "w": {
                        description: "Width of the image, overrides -width"
                    }
                }
            },
            category: CommandCategory.IMAGES
        },
    )

    registerCommand(
        "polygon",
        {
            run: async (msg: Message, args: ArgumentList, sendCallback) => {
                let opts;
                [opts, args] = getOpts(args)
                let color = opts['color'] || "white"
                let img_link = getImgFromMsgAndOpts(opts, msg)
                if (!img_link) {
                    return {
                        content: "no img found",
                        status: StatusCode.ERR
                    }
                }
                let coords = args.join(" ")
                let positions: [string, string][] = []
                for (let pos of coords.split('|')) {
                    let [x, y] = pos.trim().split(" ").map(v => v.replace(/[\(\),]/g, ""))
                    positions.push([x, y])
                }
                let img_data = await fetch.default(String(img_link))
                let fn = `${generateFileName("polygon", msg.author.id)}.png`
                fs.writeFileSync(fn, await img_data.buffer())
                let img = await canvas.loadImage(fn)
                fs.rmSync(fn)
                let canv = new canvas.Canvas(img.width, img.height)
                let ctx = canv.getContext("2d")
                ctx.drawImage(img, 0, 0, img.width, img.height)
                ctx.beginPath()

                let startX = parsePosition(positions[0][0], img.width)
                let startY = parsePosition(positions[0][1], img.height)
                ctx.moveTo(startX, startY)
                let minX = startX, minY = startY
                let maxX = startX, maxY = startY
                for (let pos of positions.slice(1)) {
                    let x = parsePosition(pos[0], img.width)
                    let y = parsePosition(pos[1], img.width)
                    if (x < minX) minX = x;
                    if (x > maxX) maxX = x;
                    if (y < minY) minY = y;
                    if (y > maxY) maxY = y
                    ctx.lineTo(x, y)
                }
                ctx.fillStyle = String(color)
                ctx.fill()
                const buffer = canv.toBuffer("image/png")
                fs.writeFileSync(fn, buffer)
                handleSending(msg, { files: [{ attachment: fn, name: fn }], status: StatusCode.RETURN }, sendCallback).then(res => {
                    fs.rmSync(fn)
                })
                return {
                    content: "generating img",
                    status: StatusCode.INFO
                }
            },
            category: CommandCategory.IMAGES,
            help: {
                info: "Create a polygon",
                arguments: {
                    "positions": {
                        description: "a list of <x> <y> positions seperated by |",
                        required: true
                    }
                },
                options: {
                    color: {
                        description: "The color of the polygon"
                    }
                }
            }
        },
    )

    registerCommand(
        "rect",
        {
            run: async (msg: Message, args: ArgumentList, sendCallback) => {
                let opts;
                [opts, args] = getOpts(args)
                let color: string = <string>opts['color'] || "white"
                let _outline = opts['outline']
                let img = getImgFromMsgAndOpts(opts, msg)
                if (!img) {
                    return {
                        content: "no img found",
                        status: StatusCode.ERR
                    }
                }
                let gradient: Array<string> | undefined
                if (typeof opts["gradient"] == 'string')
                    gradient = opts['gradient'].split(">")
                let [x, y, width, height] = args.slice(0, 4)
                if (!x) {
                    x = typeof opts['x'] === 'string' ? opts['x'] : "0"
                }
                if (!y) {
                    y = typeof opts['y'] === 'string' ? opts['y'] : "0"
                }
                if (!width) {
                    //@ts-ignore
                    width = opts['w'] || opts['width'] || opts['size'] || "50"
                }
                if (!height) {
                    //@ts-ignore
                    height = opts['h'] || opts['height'] || opts['size'] || width || "50"
                }
                let intWidth = parseInt(width as string) || 50
                let intHeight = parseInt(height as string) || 50
                //@ts-ignore
                https.request(img, resp => {
                    let data = new Stream.Transform()
                    resp.on("data", chunk => {
                        data.push(chunk)
                    })
                    resp.on("end", async () => {
                        let fn = `${generateFileName("rect", msg.author.id)}.png`
                        fs.writeFileSync(fn, data.read())
                        let oldImg = sharp(fn).png()
                        let oldMeta = await oldImg.metadata()
                        let [oldWidth, oldHeight] = [oldMeta.width, oldMeta.height]

                        let newImg
                        if (gradient) {
                            newImg = sharp(await createGradient(gradient, intWidth, intHeight))
                        }
                        else {
                            let trueColor
                            if (typeof color === 'boolean') {
                                trueColor = 'black'
                            } else {
                                trueColor = color;
                            }
                            newImg = sharp({
                                create: {
                                    width: intWidth,
                                    height: intHeight,
                                    channels: 4,
                                    background: trueColor
                                }
                            })
                        }
                        let composedImg = await oldImg.composite([{ input: await newImg.png().toBuffer(), top: parsePosition(y, oldHeight as number, intHeight), left: parsePosition(x, oldWidth as number, intWidth) }]).png().toBuffer()
                        /*
                                if(outline){
                                    let [color, lineWidth] = outline.split(":")
                                    ctx.lineWidth = parseInt(lineWidth || opts['o-width'] || "1")
                                    let outline_gradient = color.split(">")
                                    if((outline_gradient?.length || 0) <= 1)
                                        outline_gradient = opts['o-gradient']?.split(">")
                                    if(outline_gradient){
                                        let grad_angle = (opts['o-grad-angle'] || 0.0) * Math.PI / 180
                                        ctx.strokeStyle = await createGradient(outline_gradient, grad_angle, x - ctx.lineWidth / 2, y - ctx.lineWidth / 2, width + ctx.lineWidth, height + ctx.lineWidth, msg, ctx)
                                    }
                                    else ctx.strokeStyle = color || opts['o-color'] || 'white'
                                    ctx.strokeRect(x - ctx.lineWidth / 2, y - ctx.lineWidth / 2, width + ctx.lineWidth, height + ctx.lineWidth)
                                }
                        */
                        fs.writeFileSync(fn, composedImg)
                        handleSending(msg, { files: [{ attachment: fn, name: fn }], status: StatusCode.RETURN }, sendCallback).then(_res => {
                            fs.rmSync(fn)
                        }).catch(_err => {
                        })
                    })
                }).end()
                return {
                    content: "generating img",
                    status: StatusCode.INFO
                }
            },
            help: {
                info: "Generate rectangles :))",
                arguments: {
                    x: {
                        description: "x position of rectangle",
                        required: false
                    },
                    y: {
                        description: "y position of rectangle",
                        requires: "x"
                    },
                    width: {
                        description: "width of rectangle",
                        requires: "y"
                    },
                    height: {
                        description: "height of rectangle",
                        requires: "width"
                    }
                },
                options: {
                    color: {
                        description: "color of the rectangle, if color is 'transparent', it will make that section of the image transparent"
                    },
                    gradient: {
                        description: "Use a gradient, syntax: <code>-gradient=color1>color2...[:angle]</code>"
                    },
                    "grad-angle": {
                        description: "The angle of the gradient, in degrees"
                    },
                    "outline": {
                        description: "Outline of the rectangle, syntax: <code>-outline=color[>color2][:size]</code>"
                    },
                    "o-color": {
                        description: "Color of the outline, overrides outline-color"
                    },
                    "o-width": {
                        description: "Width of the outline, overrides outline-width"
                    },
                    "o-gradient": {
                        description: "Same as outline-gradient, and overrides it"
                    },
                    "o-grad-angle": {
                        description: "Outline gradient angle, overrides outline-grad-angle"
                    },
                    "width": {
                        description: "The width of the rectangle"
                    },
                    "w": {
                        description: "The width of the rectangle, overrides -width"
                    },
                    "height": {
                        description: "The height of the rectangle"
                    },
                    "h": {
                        description: "The height of the rectangle, overrides -height"
                    },
                    "size": {
                        description: "The width, and height of the rectangle, given as 1 number"
                    },
                    "img": {
                        description: "A link to the image to use"
                    }
                }
            },
            category: CommandCategory.IMAGES
        },
    )

    registerCommand(
        "scale",
        {
            run: async (_msg: Message, _args: ArgumentList, sendCallback) => {
                /*
                    let opts;
                    [opts, args] = getOpts(args)
                    let xScale = args[0] || "2.0"
                    let yScale = args[1] || "2.0"
                    let img = getImgFromMsgAndOpts(opts, msg)
                    if(!img){
                        return {content: "no img found"}
                    }
                    https.request(img, resp => {
                        let data = new Stream.Transform()
                        resp.on("data", chunk => {
                            data.push(chunk)
                        })
                        let fn = `${generateFileName("scale", msg.author.id)}.png`
                        resp.on("end", async() => {
                            fs.writeFileSync(fn, data.read())
                            let img = await canvas.loadImage(fn)
                            fs.rmSync(fn)
                            xScale = Math.min(parsePosition(xScale, img.width, img.width, parseFloat), 2000)
                            yScale = Math.min(parsePosition(yScale, img.height, img.height, parseFloat), 2000)
                            let canv = new canvas.Canvas(img.width * xScale, img.height * yScale)
                            let ctx = canv.getContext("2d")
                            ctx.drawImage(img, 0, 0, img.width * xScale, img.height * yScale)
                            let buffer
                            try{
                                buffer = canv.toBuffer("image/png")
                            }
                            catch(err){
                                await sendCallback("Could not generate image")
                                return
                            }
                            fs.writeFileSync(fn, buffer)
                            sendCallback({files: [{attachment: fn, name: fn,}]}).then(res => {
                                fs.rmSync(fn)
                            }).catch(err => {
                            })
                        })
                    }).end()
                */
                return {
                    content: "generating img",
                    status: StatusCode.INFO
                }
            },
            help: {
                arguments: {
                    "scale-width": {
                        description: "The amount to scale the width by"
                    },
                    'scale-height': {
                        description: 'The amount to scale the height by'
                    }
                }
            },
            category: CommandCategory.IMAGES
        },
    )

    registerCommand(
        "filter",
        {
            run: async (_msg: Message, _args: ArgumentList, sendCallback) => {
                /*
                    let opts;
                    [opts, args] = getOpts(args)
                    let stringArgs = args.join(" ")
                    let filters = stringArgs.split("|")
                    let img = getImgFromMsgAndOpts(opts, msg)
                    if(!img){
                        return {content: "no img found"}
                    }
                    https.request(img, resp => {
                        let data = new Stream.Transform()
                        resp.on("data", chunk => {
                            data.push(chunk)
                        })
                        let fn = `${generateFileName("scale", msg.author.id)}.png`
                        resp.on("end", async() => {
                            fs.writeFileSync(fn, data.read())
                            let img = await canvas.loadImage(fn)
                            fs.rmSync(fn)
                            let canv = new canvas.Canvas(img.width, img.height)
                            let ctx = canv.getContext("2d")
                            ctx.drawImage(img, 0, 0, img.width, img.height)
                            let buffer = canv.toBuffer("image/png")
                            let jimpImg = await jimp.read(buffer)
                            for(let filter of filters){
                                let args;
                                [filter, args] = filter.split(":")
                                jimpImg = await applyJimpFilter(jimpImg, filter, args)
                            }
                            buffer = await jimpImg.getBufferAsync("image/png")
                            fs.writeFileSync(fn, buffer)
                            sendCallback({files: [{attachment: fn, name: fn,}]}).then(res => {
                                fs.rmSync(fn)
                            }).catch(err => {
                            })
                        })
                    }).end()
                */
                return {
                    content: "generating img",
                    status: StatusCode.INFO
                }
            },
            help: {
                info: "Filters:<br>rotate[:angle]<br>flip[:hor|vert]<br>brightness[:val]<br>grey|greyscale|gray|grayscale<br>invert<br>contrast[:val]",
                arguments: {
                    filter: {
                        description: "The filters to use, each filter is seperated by |"
                    }
                }
            },
            category: CommandCategory.IMAGES
        },
    )

    registerCommand(
        "img-info", createCommand(async (msg, args, sendCallback) => {
            let opts;
            [opts, args] = getOpts(args)
            let img = getImgFromMsgAndOpts(opts, msg)
            if (!img || img === true) {
                return { content: "No image given", status: StatusCode.ERR }
            }
            let image = await canvas.loadImage(img)

            return { content: `width: ${image.width}\nheight: ${image.height}`, status: StatusCode.RETURN }
        }, CommandCategory.IMAGES),
    )

    registerCommand(
        "overlay", createCommand(async (msg, _, sc, opts, args) => {
            let [img1, img2] = args.join(" ").split("|")
            img1 = img1.trim()
            img2 = img2.trim()
            if (img1 && !img1.startsWith("http")) {
                let new_img1 = getVar(msg, img1, msg.author.id)
                if (!new_img1) {
                    new_img1 = getVar(msg, img1, "__global__")
                }
                img1 = String(new_img1)
            }
            if (!img1 || !img1.startsWith("http")) {
                img1 = getImgFromMsgAndOpts(opts, msg) as string
                if (msg.attachments.keyAt(0)) {
                    msg.attachments.delete(msg.attachments.keyAt(0) as string)
                }
            }
            if (img2 && !img2.startsWith("http")) {
                let new_img2 = getVar(msg, img2, msg.author.id)
                if (!new_img2) {
                    new_img2 = getVar(msg, img2, "__global__")
                }
                img2 = String(new_img2)
            }
            if (!img2 || !img2.startsWith("http")) {
                img2 = getImgFromMsgAndOpts(opts, msg) as string
            }
            console.log(img1, img2)
            if (!img2 || !img1) {
                return { content: `Must provide 2 images\nimg1: ${img1}\nimg2: ${img2}`, status: StatusCode.ERR }
            }
            let image1 = await canvas.loadImage(img1)
            let image2 = await canvas.loadImage(img2)
            let canv = new canvas.Canvas(image2.width, image2.height)
            let ctx = canv.getContext("2d")
            ctx.drawImage(image2, 0, 0)
            ctx.globalAlpha = parseFloat(String(opts['alpha'])) || 0.5
            ctx.drawImage(image1, 0, 0, canv.width, canv.height)

            let fn = `${generateFileName("overlay", msg.author.id)}.png`
            fs.writeFileSync(fn, canv.toBuffer("image/png"))

            return {
                files: [
                    {
                        attachment: fn,
                        name: fn,
                        delete: true
                    }
                ],
                status: StatusCode.RETURN
            }

        }, CommandCategory.IMAGES,
            `overlay image 1 onto image 2 seperated by |
<br>
If an image is not provided it will be pulled from chat, or an image you gave it`,
            {
                img1: createHelpArgument("The first image, put a | if you just want to use an image from chat"),
                img2: createHelpArgument("A link to image, an image you  gave as attachment, or an image from chat")
            },
            {
                alpha: createHelpOption("The alpha to use, defaults to 0.5")
            }),
    )

    registerCommand(
        "text", {
        //text command
        run: async (msg: Message, args: ArgumentList, sendCallback) => {
            let opts: Opts;
            [opts, args] = getOpts(args)

            let img;
            if (opts['img'] || msg.attachments.at(0)) {
                img = getImgFromMsgAndOpts(opts, msg)
            }

            let width = Number(opts['w']) || 0
            let height = Number(opts['h']) || 0
            if (width * height > 4000000) {
                return { content: "Too large", status: StatusCode.ERR }
            }

            let text = args.join(" ")
            if (!text) {
                return { content: "No text", status: StatusCode.ERR }
            }

            let lineCount = text.split("\n").length

            let font_size = String(opts['size'] || "10") + "px"
            let font = String(opts['font'] || "serif")

            if (width === 0 || height === 0) {
                let c = new canvas.Canvas(1000, 1000)
                let ctx = c.getContext("2d")
                ctx.font = `${font_size} ${font}`
                let textInfo = ctx.measureText(text)
                width ||= textInfo.width
                //@ts-ignore
                height ||= parseFloat(font_size) * (72 / 96) + (textInfo.emHeightDescent / lineCount) + textInfo.actualBoundingBoxDescent
            }

            let canv, ctx;
            if (img) {
                let image = await canvas.loadImage(img as string)
                width = width || image.width
                height = height || image.height
                canv = new canvas.Canvas(width, height, "image")
                ctx = canv.getContext("2d")
                ctx.drawImage(image, 0, 0)
            }
            else {
                width = width || 100
                height = height || 100
                canv = new canvas.Canvas(width, height, "image")
                ctx = canv.getContext("2d")
            }


            ctx.font = `${font_size} ${font}`
            let textInfo = ctx.measureText(text)

            if (opts['measure']) {
                if (opts['measure'] !== true) {
                    //@ts-ignore
                    return { content: String(textInfo[opts['measure']]), status: StatusCode.RETURN }
                }
                return { content: JSON.stringify(textInfo), status: StatusCode.RETURN }
            }

            ctx.textBaseline = Pipe.start(opts['baseline']).default("top").next((v: string) => String(v)).done()

            let req_x = String(opts['x'] || 0)
            let x = parsePosition(req_x, width, textInfo.width)
            let req_y = String(opts['y'] || 0)
            //@ts-ignore
            let y = parsePosition(req_y, width, parseFloat(font_size) * (72 / 96) + (textInfo.emHeightDescent / lineCount) + textInfo.actualBoundingBoxDescent)

            let bg_colors = intoColorList(String(opts['bg'] || "transparent"))
            if (bg_colors.length == 1) {
                if (bg_colors[0] !== 'transparent') {
                    ctx.fillStyle = bg_colors[0]
                    //@ts-ignore
                    ctx.fillRect(x, y, textInfo.width, parseFloat(font_size) * (72 / 96) + (textInfo.emHeightDescent / lineCount) + textInfo.actualBoundingBoxDescent)
                }
            }
            else {
                //@ts-ignore
                let grad = ctx.createLinearGradient(x, y, x + textInfo.width, y + parseFloat(font_size) * (72 / 96) + (textInfo.emHeightDescent / lineCount) + textInfo.actualBoundingBoxDescent)
                let interval = 1 / (bg_colors.length - 1)
                for (let i = 0; i < bg_colors.length; i++) {
                    grad.addColorStop(interval * i, bg_colors[i])
                }
                ctx.fillStyle = grad
                //@ts-ignore
                ctx.fillRect(x, y, textInfo.width, parseFloat(font_size) * (72 / 96) + (textInfo.emHeightDescent / lineCount) + textInfo.actualBoundingBoxDescent)
            }

            let colors = intoColorList(String(opts['color'] || "red"))
            if (colors.length == 1) {
                ctx.fillStyle = colors[0]
            }
            else {
                //@ts-ignore
                let grad = ctx.createLinearGradient(x, y, x + textInfo.width, y + parseFloat(font_size) * (72 / 96) + textInfo.actualBoundingBoxDescent + (textInfo.emHeightDescent / lineCount))
                let interval = 1 / (colors.length - 1)
                for (let i = 0; i < colors.length; i++) {
                    grad.addColorStop(interval * i, colors[i])
                }
                ctx.fillStyle = grad
            }

            ctx.fillText(text, x, y, width)

            let fn = `${generateFileName("text", msg.author.id)}.png`
            fs.writeFileSync(fn, canv.toBuffer("image/png"))

            return {
                files: [
                    {
                        attachment: fn,
                        name: fn,
                        delete: true
                    }
                ],
                status: StatusCode.RETURN
            }
        },
        help: {
            info: "Put text on an image",
            arguments: {
                text: {
                    description: "The text to put",
                    required: true
                }
            },
            options: {
                img: {
                    description: "Whether or not to use an existing image, either pulled from chat, or the message sent"
                },
                size: {
                    description: "Size of the text"
                },
                font: {
                    description: "Font of text (restricted to fonts i have installed)"
                },
                color: {
                    description: "Color of the text"
                },
                x: {
                    description: "x of the text"
                },
                y: {
                    description: "y of the text"
                },
                bg: {
                    description: "The color behind the text"
                },
                measure: {
                    description: `Sends information about the text size
            <br>
            Possible values for this option:
            <ul>
                <li>None</li>
                <li>width</li>
                <li>actualBoundingBoxLeft</li>
                <li>actualBoundingBoxRight</li>
                <li>actualBoundingBoxAscent</li>
                <li>actualBoundingBoxDescent</li>
                <li>emHeightAscent</li>
                <li>emHeightDescent</li>
                <li>alphabeticBaseline</li>
            </ul>`
                }
            }
        },
        category: CommandCategory.IMAGES
    },
    )

    registerCommand(
        "rotate",
        {
            run: async (msg: Message, args: ArgumentList, sendCallback) => {
                let opts: Opts;
                [opts, args] = getOpts(args)
                let img = getImgFromMsgAndOpts(opts, msg)
                if (!img || img === true) {
                    return { content: "No image found", status: StatusCode.ERR }
                }
                let amount = Number(args[0]) || 90
                let color = args[1] || "#00000000"
                let img_data = await fetch.default(img)
                let buf = await img_data.buffer()
                let fn = `${generateFileName("rotate", msg.author.id)}.png`
                try {
                    await sharp(buf)
                        .rotate(amount, { background: color })
                        .toFile(fn)
                    return {
                        files: [
                            {
                                attachment: fn,
                                name: fn,
                                delete: true
                            }
                        ],
                        status: StatusCode.RETURN
                    }
                }
                catch {
                    return { content: "Something went wrong rotating image", status: StatusCode.ERR }
                }
            },
            category: CommandCategory.IMAGES,
            help: {
                info: "Rotates an image by an angle (degrees)"
            }
        },
    )

    registerCommand(
        "color",
        {
            run: async (msg: Message, args: ArgumentList, sendCallback) => {
                let opts;
                [opts, args] = getOpts(args)
                let stringArgs = args.join(" ")
                let color = stringArgs || "RANDOM"
                let colors = stringArgs.split(">")

                const width = Math.min(parseInt(opts['w'] as string) || 250, 2000)
                const height = Math.min(parseInt(opts['h'] as string) || 250, 2000)

                let content = color
                let fn = `${generateFileName("color", msg.author.id)}.png`
                let buffer
                if (colors.length > 1) {
                    let gradient = []
                    let colorStrings = []
                    for (let i = 0; i < Math.min(colors.length, 1e9); i++) {
                        let R, G, B
                        if (colors[i]) {
                            colorStrings.push(colors[i])
                            gradient.push(colors[i])
                        }
                        else {
                            [R, G, B] = randomColor()
                            gradient.push(`rgb(${R}, ${G}, ${B})`)
                            colorStrings.push(rgbToHex(R, G, B))
                        }
                    }
                    try {
                        buffer = await sharp(await createGradient(gradient, width, height)).png().toBuffer()
                    }
                    catch (err) {
                        return { content: "error making color", status: StatusCode.ERR }
                    }
                    content = colorStrings.join(" > ")
                }
                else {
                    if (color == "RANDOM") {
                        let [R, G, B] = randomColor()
                        color = `rgb(${R}, ${G}, ${B})`
                        content = rgbToHex(R, G, B)
                    }
                    try {
                        buffer = await sharp({
                            create: {
                                width: width,
                                height: height,
                                channels: 4,
                                background: color
                            }
                        }).png().toBuffer()
                    }
                    catch (err) {
                        return { content: "error making color", status: StatusCode.ERR }
                    }
                }
                fs.writeFileSync(fn, buffer)
                return {
                    files: [
                        {
                            attachment: fn,
                            name: `file.png`,
                            description: "why can i describe this"
                        }
                    ],
                    content: content,
                    status: StatusCode.RETURN
                }
            },
            help: {
                info: "Generate a random color",
                arguments: {
                    "color": {
                        description: "The color to generate, can also be >, which will create a gradient"
                    }
                },
                options: {
                    "w": {
                        description: "width of image"
                    },
                    "h": {
                        description: "height of image"
                    }
                }
            },
            category: CommandCategory.IMAGES

        },
    )
}
