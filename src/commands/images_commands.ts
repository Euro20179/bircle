import fs from 'fs'
import https from 'https'

import { Stream } from 'stream'

import { ccmdV2, CommandCategory, createCommandV2, createHelpArgument, createHelpOption, crv, crvFile, StatusCode } from '../common_to_commands'
import { cmdFileName, createGradient, getImgFromMsgAndOpts, getImgFromMsgAndOptsAndReply, intoColorList, isMsgChannel, isNumeric, Pipe, randomHexColorCode } from '../util'
import { parsePosition, getOpts } from '../parsing'
import sharp, { PngOptions, Sharp } from 'sharp'
import cmds from '../command-parser/cmds'
const handleSending = cmds.handleSending

export default function*(): Generator<[string, CommandV2]> {
    yield [
        "img-mod", ccmdV2(async function({ args, msg, opts, stdin }) {
            const img = await getImgFromMsgAndOptsAndReply(opts, msg, stdin, false)

            const modifications: {[key: string]: (img: Sharp, args: string[]) => Sharp | false} = {
                rotate: (img, args) => {
                    if (!isNumeric(args[0])) {
                        return false
                    }
                    return img.rotate(Number(args[0]))
                },
                tint: (img, args) => {
                    return img.tint(args[0])
                },
                grey: (img, _args) => {
                    return img.greyscale(true)
                },
                negate: (img, _args) => {
                    return img.negate()
                },
                mktrans: (img, _args) => {
                    return img.unflatten()
                },
                threshold: (img, args) => {
                    if(!isNumeric(args[0])){
                        return false
                    }
                    return img.threshold(Number(args[0]), { greyscale: false })
                },
            }

            if (!img) {
                return crv("No image given", { status: StatusCode.ERR })
            }
            let imgRes = await fetch(img as string)
            let imgBuf = await imgRes.arrayBuffer()
            let sharpImg = sharp(imgBuf)

            for(let i = 0; i < args.length; i++){
                const modArgList = []
                const modification = args[i]
                for(i++; i < args.length && !(args[i] in modifications); i++){
                    modArgList.push(args[i])
                }
                //the for loop is going to go one too far
                i--
                if(!(modification in modifications)) {
                    return crv(`Invalid modification: "${modification}"`, { status: StatusCode.ERR })
                }
                const res = modifications[modification](sharpImg, modArgList)
                if(res === false){
                    return crv(`Invalid modification arguments: "${modification}(${args.join(", ")})"`, { status: StatusCode.ERR })
                }
                sharpImg = res
            }

            let outputType = opts.getString("f", "png")

            const validOutputTypes = ["jxl", "png", "jpeg", "webp", "gif", "jp2", "tiff", "raw"]

            if (!validOutputTypes.includes(outputType)) {
                outputType = "png"
            }

            const fn = cmdFileName`img-mod ${msg.author.id} ${outputType}`
            //@ts-ignore
            fs.writeFileSync(fn, await sharpImg[outputType]().toBuffer())
            return {
                files: [
                    crvFile(fn, `img-mod-${msg.author.id}.${outputType}`, "Modified image", true)
                ]
            }
        }, "Apply various filters and transformations to an image", {
                docs: `<h3>Transformations</h3>
<ul>
<li>rotate {angle}</li>
</ul>
<h3>Color transformations</h3>
<ul>
<li>tint {color} (supports most valid [css colors](https://developer.mozilla.org/en-US/docs/Web/CSS/color_value))</li>
<li>grey</li>
<li>negate</li>
<li>mktrans (turns white pixels into transparent pixels)</li>
<li>threshold {threshold} (makes the following color transformations only apply to color values after the threshold)</li>
</ul>`,
                helpArguments: {
                    "...modifications": createHelpArgument("A list of name, arguments of modifications to an image")
                },
                helpOptions: {
                    f: createHelpOption("The output file type", undefined, "png"),
                }
            })
    ]

    yield [
        "picsum.photos", createCommandV2(async ({ rawOpts: opts, msg, args }) => {
            let width = parseInt(args[0]) || 100;
            let height = parseInt(args[1]) || 100;
            let data = await fetch(`https://picsum.photos/${width}/${height}`);
            if (data.status !== 200) {
                return { content: `picsum returned a ${data.status} error`, status: StatusCode.ERR }
            }
            if (opts['url']) {
                return { content: data.url, status: StatusCode.RETURN }
            }
            let png_fetch = await fetch(data.url)
            let png = await png_fetch.arrayBuffer()
            const fn = cmdFileName`picsum.photos ${msg.author.id} png`
            fs.writeFileSync(fn, Buffer.from(png))
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
    ]

    yield [
        "img", ccmdV2(async function({ args, opts }) {
            let gradOpt = opts.getString("gradient", false);
            let gradient;
            if (gradOpt) {
                gradient = gradOpt.split(">")
            }
            const width = Number(args[0]) || opts.getNumber("w", opts.getNumber("width", opts.getNumber("size", 0))),
                height = Number(args[1]) || opts.getNumber("h", opts.getNumber("height", opts.getNumber("size", width || 100)))

            if (width < 0) {
                return crv("Width must be > 0", { status: StatusCode.ERR })
            }
            if (height < 0) {
                return crv("Height must be > 0", { status: StatusCode.ERR })
            }
            let img = gradient ?
                sharp(await createGradient(gradient, width, height)) :
                sharp({
                    create: {
                        width, height,
                        channels: 4,
                        background: opts.getString("color", args[2] || 'black')
                    }
                });
            fs.writeFileSync(`./out.png`, await img.png().toBuffer())
            return {
                files: [
                    crvFile('out.png', 'file.png', "Why can I describe this")
                ],
                content: "Your image, sir",
                status: StatusCode.RETURN
            }

        }, "Creates an image", {
            docs: "There is a maximum size of 2000px",
            helpArguments: {
                width: createHelpArgument("The width of the image", false),
                height: createHelpArgument("The height of the image", false, "width"),
                color: createHelpArgument("Color of the image", false, "height")
            },
            helpOptions: {
                "fmt": createHelpOption("The image format to use, can be png, or jpg, eg: -fmt=png"),
                "gradient": createHelpOption("Put a gradient instead of solid color, syntax: <code>-gradient=color1>color2>color3...</code>"),
                "grad-angle": createHelpOption("The angle to put the gradient at in degrees"),
                "size": createHelpOption("Width, and height of the image, syntax: <code>-size=number</code>"),
                "height": createHelpOption("Height of the image"),
                "h": createHelpOption("Height of the image, overrides -height"),
                "width": createHelpOption("Width of the image"),
                "w": createHelpOption("Width of the image, overrides -width"),
            }
        })
    ]

    yield [
        "rect", ccmdV2(async function({ rawOpts: opts, msg, args, sendCallback }) {
            let color: string = <string>opts['color'] || "white"
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
                width = String(opts['w'] || opts['width'] || opts['size'] || "50")
            }
            if (!height) {
                height = String(opts['h'] || opts['height'] || opts['size'] || width || "50")
            }
            let intWidth = parseInt(width as string) || 50
            let intHeight = parseInt(height as string) || 50
            https.request(img, resp => {
                let data = new Stream.Transform()
                resp.on("data", chunk => {
                    data.push(chunk)
                })
                resp.on("end", async () => {
                    let fn = cmdFileName`rect ${msg.author.id} png`
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
                    let composedImg = await oldImg.composite([{ input: await newImg.png().toBuffer(), top: Number(parsePosition(y, oldHeight as number, intHeight)), left: Number(parsePosition(x, oldWidth as number, intWidth)) }]).png().toBuffer()
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
        }, "Generate rectangles :))", {
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
        })
    ]

    yield [
        "rotate", ccmdV2(async function({ msg, argShapeResults, opts, stdin }) {
            let img = getImgFromMsgAndOpts(opts, msg, stdin)
            if (!img) {
                return { content: "No image found", status: StatusCode.ERR }
            }
            let amount = argShapeResults.angle as number
            let color = argShapeResults.color as string
            let buf;
            if (!img.startsWith("http") && fs.existsSync(img)) {
                buf = fs.readFileSync(img)
            }
            else {
                buf = await (await (await fetch(img)).blob()).arrayBuffer()
            }
            let fn = cmdFileName`rotate ${msg.author.id} png`
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
        }, "Rotates an image by an angle (deg)", {
            argShape: async function*(args) {
                yield [args.expectFloat(1), "angle"],
                    yield [args.expectString(1), "color", true, "#00000000"]
            },
            helpArguments: {
                angle: createHelpArgument("Angle to rotate image (deg)", true),
                color: createHelpArgument("Background color to fill space", false, undefined, "#00000000")
            },
            accepts_stdin: "An image can be passed by pipe"
        })
    ]

    yield [
        "color", ccmdV2(async function({ rawOpts: opts, msg, args }) {
            let stringArgs = args.join(" ")
            let color = stringArgs || "RANDOM"
            let colors = stringArgs.split(">")

            const width = Math.min(parseInt(opts['w'] as string) || 250, 2000)
            const height = Math.min(parseInt(opts['h'] as string) || 250, 2000)

            let content = color
            let fn = cmdFileName`color ${msg.author.id} png`
            let buffer
            if (colors.length > 1) {
                let gradient = []
                let colorStrings = []
                for (let i = 0; i < Math.min(colors.length, 1e9); i++) {
                    if (colors[i]) {
                        colorStrings.push(colors[i])
                        gradient.push(colors[i])
                    }
                    else {
                        colorStrings.push(randomHexColorCode())
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
                    color = randomHexColorCode()
                    content = color
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
                    console.error(err)
                    return { content: "error making color", status: StatusCode.ERR }
                }
            }
            fs.writeFileSync(fn, buffer)
            return {
                files: !opts['no-image'] && [
                    {
                        attachment: fn,
                        name: `file.png`,
                        description: "why can i describe this"
                    }
                ] || undefined,
                content: content,
                status: StatusCode.RETURN
            }
        }, "Generate a random color", {
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
        })
    ]
}
