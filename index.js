"use strict";
///<reference path="index.d.ts" />
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var fs = require("fs");
var https = require('https');
var Stream = require('stream');
var execSync = require('child_process').execSync;
var REST = require('@discordjs/rest').REST;
var Routes = require("discord-api-types/v9").Routes;
var _a = require('discord.js'), Client = _a.Client, Intents = _a.Intents, MessageEmbed = _a.MessageEmbed, Message = _a.Message, Interaction = _a.Interaction;
var sharp = require('sharp');
var got = require('got');
var cheerio = require('cheerio');
var jimp = require('jimp');
var _b = require('./common.js'), prefix = _b.prefix, vars = _b.vars, ADMINS = _b.ADMINS, FILE_SHORTCUTS = _b.FILE_SHORTCUTS, WHITELIST = _b.WHITELIST, BLACKLIST = _b.BLACKLIST, addToPermList = _b.addToPermList, removeFromPermList = _b.removeFromPermList;
var _c = require('./parsing.js'), parseCmd = _c.parseCmd, parsePosition = _c.parsePosition;
var _d = require('./util.js'), downloadSync = _d.downloadSync, fetchUser = _d.fetchUser, format = _d.format, generateFileName = _d.generateFileName, createGradient = _d.createGradient, applyJimpFilter = _d.applyJimpFilter, randomColor = _d.randomColor, rgbToHex = _d.rgbToHex;
var client = new Client({ intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES, Intents.FLAGS.GUILD_MEMBERS] });
var token = fs.readFileSync("./TOKEN", "utf-8");
var CLIENT_ID = fs.readFileSync("./CLIENT", "utf-8");
var GUILD_ID = fs.readFileSync("./GUILD", "utf-8");
var SPAM_ALLOWED = true;
var SPAMS = {};
var lastCommand;
var snipe;
var illegalLastCmds = ["!!", "spam"];
function createChatCommand(name, description, options) {
    return {
        name: name,
        description: description,
        options: options
    };
}
var STRING = 3;
var INTEGER = 4;
var BOOL = 5;
var USER = 6;
var CHANNEL = 7;
var ROLE = 8;
var MENTIONABLE = 9;
var NUMBER = 10;
var ATTACH = 11;
function createChatCommandOption(type, name, description, _a) {
    var min = _a.min, max = _a.max, required = _a.required;
    var obj = {
        type: type,
        name: name,
        description: description,
        required: required || false
    };
    if (min) {
        obj["min"] = min;
    }
    if (max) {
        obj["max"] = max;
    }
    return obj;
}
var slashCommands = [
    createChatCommand("attack", "attacks chris, and no one else", [createChatCommandOption(USER, "user", "who to attack", { required: true })]),
    createChatCommand("ping", "Pings a user for some time", [
        createChatCommandOption(USER, "user", "who to ping twice", { required: true }),
        createChatCommandOption(INTEGER, "evilness", "on a scale of 1 to 10 how evil are you", {})
    ]),
    createChatCommand("img", "create an image", [
        createChatCommandOption(INTEGER, "width", "width of image", { required: true, min: 0, max: 5000 }),
        createChatCommandOption(INTEGER, "height", "height of image", { required: true, min: 0, max: 5000 }),
        createChatCommandOption(STRING, "color", "color of image", {})
    ]),
    createChatCommand("ccmd", "create a custom command, WOWZERS", [
        createChatCommandOption(STRING, "name", "name of command (NO SPACES)", { required: true }),
        createChatCommandOption(STRING, "command", "the command to run (NO SPACES)", { required: true }),
        createChatCommandOption(STRING, "args", "arguments to use for command", {})
    ]),
    createChatCommand("help", "get help", []),
    {
        name: "ping",
        type: 2
    },
    {
        name: "info",
        type: 2
    }
];
function getContentFromResult(result) {
    return result['content'] || "";
}
function getOpts(args) {
    var opts = {};
    var newArgs = [];
    var idxOfFirstRealArg = 0;
    for (var _i = 0, args_1 = args; _i < args_1.length; _i++) {
        var arg = args_1[_i];
        idxOfFirstRealArg++;
        if (arg[0] == "-") {
            if (arg[1]) {
                var _a = arg.slice(1).split("="), opt = _a[0], value = _a[1];
                opts[opt] = value == undefined ? true : value;
            }
        }
        else {
            idxOfFirstRealArg--;
            break;
        }
    }
    for (var i = idxOfFirstRealArg; i < args.length; i++) {
        newArgs.push(args[i]);
    }
    return [opts, newArgs];
}
function generateHTMLFromCommandHelp(name, command) {
    var html = "<div class=\"command-section\"><h1 class=\"command-title\">" + name + "</h1>";
    var help = command["help"];
    if (help) {
        var info = help["info"] || "";
        var aliases_2 = help["aliases"] || [];
        var options = help["options"] || {};
        var args = help["arguments"] || {};
        if (info !== "") {
            html += "<h2 class=\"command-info\">Info</h2><p class=\"command-info\">" + info + "</p>";
        }
        if (args !== {}) {
            html += "<h2 class=\"command-arguments\">Arguments</h2><ul class=\"command-argument-list\">";
            for (var argName in args) {
                var argument = args[argName].description;
                var required = args[argName].required || false;
                var requires = args[argName].requires || "";
                var extraText = "";
                if (requires) {
                    extraText = "<span class=\"requires\">requires: " + requires + "</span>";
                }
                html += "<li class=\"command-argument\" data-required=\"" + required + "\">\n    <details class=\"command-argument-details-label\" data-required=\"" + required + "\" title=\"required: " + required + "\"><summary class=\"command-argument-summary\" data-required=\"" + required + "\">" + argName + "</summary>" + argument + "<br>" + extraText + "</details>\n    </li>";
            }
            html += "</ul>";
        }
        if (options !== {}) {
            html += "<h2 class=\"command-options\">Options</h2><ul class=\"command-option-list\">";
            for (var option in options) {
                var desc = options[option].description || "";
                var requiresValue = options[option].requiresValue || false;
                html += "<li class=\"command-option\">\n    <details class=\"command-option-details-label\" title=\"requires value: " + requiresValue + "\"><summary class=\"command-option-summary\">-" + option + "</summary>" + desc + "</details></li>";
            }
            html += "</ul>";
        }
        if (aliases_2 !== []) {
            html += "<h2 class=\"commmand-aliases\">Aliases</h2><ul class=\"command-alias-list\">";
            for (var _i = 0, aliases_1 = aliases_2; _i < aliases_1.length; _i++) {
                var alias = aliases_1[_i];
                html += "<li class=\"command-alias\">" + alias + "</li>";
            }
            html += "</ul>";
        }
    }
    return html + "</div><hr>";
}
function getImgFromMsgAndOpts(opts, msg) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
    var img = opts['img'];
    if ((_a = msg.attachments) === null || _a === void 0 ? void 0 : _a.at(0)) {
        img = (_b = msg.attachments.at(0)) === null || _b === void 0 ? void 0 : _b.attachment;
    }
    if ((_d = (_c = msg.reply) === null || _c === void 0 ? void 0 : _c.attachments) === null || _d === void 0 ? void 0 : _d.at(0)) {
        img = (_e = msg.reply.attachments.at(0)) === null || _e === void 0 ? void 0 : _e.attachment;
    }
    if (!img) {
        img = (_j = (_h = (_g = (_f = msg.channel.messages.cache.filter(function (m) { var _a; return (_a = m.attachments) === null || _a === void 0 ? void 0 : _a.first(); })) === null || _f === void 0 ? void 0 : _f.last()) === null || _g === void 0 ? void 0 : _g.attachments) === null || _h === void 0 ? void 0 : _h.first()) === null || _j === void 0 ? void 0 : _j.attachment;
    }
    return img;
}
var commands = {
    echo: {
        run: function (msg, args) { return __awaiter(void 0, void 0, void 0, function () {
            var opts, embedText, embed, img, color, files;
            var _a;
            var _b;
            return __generator(this, function (_c) {
                _a = getOpts(args), opts = _a[0], args = _a[1];
                embedText = opts['e'] || opts['embed'];
                if (embedText) {
                    embed = new MessageEmbed();
                    if (embedText !== true)
                        embed.setTitle(embedText);
                    img = getImgFromMsgAndOpts(opts, msg);
                    if (img) {
                        embed.setImage(img);
                    }
                    color = void 0;
                    if (color = opts['color'] || opts['e-color'] || opts['embed-color']) {
                        try {
                            embed.setColor(color);
                        }
                        catch (err) {
                        }
                    }
                }
                args = args.join(" ");
                files = (_b = msg.attachments) === null || _b === void 0 ? void 0 : _b.toJSON();
                if (!args && !embed && !files.length) {
                    return [2 /*return*/, {
                            content: "cannot send nothing"
                        }];
                }
                return [2 /*return*/, {
                        delete: !(opts["D"] || opts['no-del']),
                        content: args,
                        embeds: embed ? [embed] : undefined,
                        files: files,
                        deleteFiles: false
                    }];
            });
        }); },
        help: {
            info: "the bot will say the <code>text</code>",
            aliases: [],
            options: {
                "D": {
                    description: "If given, dont delete original message"
                },
                "no-del": {
                    description: "same as -D"
                },
                "embed": {
                    description: "Create an embed with the text following ="
                },
                "color": {
                    description: "Color of the embed"
                },
                "img": {
                    description: "Image of the embed"
                }
            },
            arguments: {
                text: {
                    description: "what to say",
                    required: true
                }
            }
        }
    },
    uptime: {
        run: function (msg, args) { return __awaiter(void 0, void 0, void 0, function () {
            var uptime, fmt, days, hours, minutes, seconds;
            return __generator(this, function (_a) {
                uptime = client.uptime;
                fmt = args[0] || "%d:%h:%m:%s";
                seconds = uptime / 1000;
                days = 0;
                hours = 0;
                minutes = 0;
                while (seconds >= 60) {
                    seconds -= 60;
                    minutes += 1;
                }
                while (minutes >= 60) {
                    minutes -= 60;
                    hours += 1;
                }
                while (hours >= 24) {
                    hours -= 24;
                    days += 1;
                }
                return [2 /*return*/, {
                        content: format(fmt, { "d": "" + days, "h": "" + hours, "m": "" + minutes, "s": "" + seconds })
                    }];
            });
        }); },
        help: {
            "info": "gives up time of the bot",
            arguments: {
                fmt: {
                    "description": "the format to show the uptime in<br>%s: seconds, %m: minutes, %h: hours, %d: days<br>{s}: seconds, {m}: minutes, {h}: hours, {d}: days"
                }
            }
        }
    },
    rand: {
        run: function (msg, args) { return __awaiter(void 0, void 0, void 0, function () {
            var low, high;
            return __generator(this, function (_a) {
                low = parseFloat(args[0]) || 0;
                high = parseFloat(args[1]) || 1;
                return [2 /*return*/, {
                        content: String(Math.random() * (high - low) + low)
                    }];
            });
        }); },
        help: {
            arguments: {
                low: {
                    "description": "the lowest number"
                },
                high: {
                    "description": "the highest number"
                }
            }
        }
    },
    img: {
        run: function (msg, args) { return __awaiter(void 0, void 0, void 0, function () {
            var opts, gradient, width, height, img, _a;
            var _b;
            var _c;
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0:
                        opts = {};
                        _b = getOpts(args), opts = _b[0], args = _b[1];
                        gradient = (_c = opts['gradient']) === null || _c === void 0 ? void 0 : _c.split(">");
                        width = Math.min(parseFloat(args[0]) || parseFloat(opts['w']) || parseFloat(opts['width']) || parseFloat(opts['size']) || 100, 2000);
                        height = Math.min(parseFloat(args[1]) || parseFloat(opts['h']) || parseFloat(opts['height']) || parseFloat(opts['size']) || width || 100, 2000);
                        if (width < 0) {
                            return [2 /*return*/, {
                                    content: "Width must be > 0"
                                }];
                        }
                        if (height < 0) {
                            return [2 /*return*/, {
                                    content: "Height must be > 0"
                                }];
                        }
                        if (!gradient) return [3 /*break*/, 3];
                        _a = sharp;
                        return [4 /*yield*/, createGradient(gradient, width, height)];
                    case 1: return [4 /*yield*/, _a.apply(void 0, [_d.sent()]).toBuffer()];
                    case 2:
                        img = _d.sent();
                        return [3 /*break*/, 5];
                    case 3: return [4 /*yield*/, sharp({
                            create: {
                                width: width,
                                height: height,
                                channels: 4,
                                background: args[2] || opts['color'] || "black"
                            }
                        }).png().toBuffer()];
                    case 4:
                        img = _d.sent();
                        _d.label = 5;
                    case 5:
                        fs.writeFileSync("./out.png", img);
                        console.log("hi");
                        return [2 /*return*/, {
                                files: [
                                    {
                                        attachment: "out.png",
                                        name: "file.png",
                                        description: "why can i describe this"
                                    }
                                ],
                                content: "Your image, sir"
                            }];
                }
            });
        }); },
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
                    description: "Put a gradient instead of solid color, stynax: <code>-gradient=color1>color2>color3...</code>"
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
        }
    },
    polygon: {
        run: function (msg, args) { return __awaiter(void 0, void 0, void 0, function () {
            var opts;
            return __generator(this, function (_a) {
                return [2 /*return*/, {
                        content: "Broken"
                    }
                    /*
                        [opts, args] = getOpts(args)
                        let gradient = opts['gradient']?.split(">")
                        let color = opts['color'] || "white"
                        let img = getImgFromMsgAndOpts(opts, msg)
                        if(!img){
                            return {
                                content: "no img found"
                            }
                        }
                        args = args.join(" ")
                        let positions = []
                        for(let pos of args.split('|')){
                            let [x, y] = pos.trim().split(" ").map(v => v.replace(/[\(\),]/g, ""))
                            positions.push([x, y])
                        }
                        https.request(img, resp => {
                            let data = new Stream.Transform()
                            resp.on("data", chunk => {
                                data.push(chunk)
                            })
                            resp.on("end", async() => {
                                let fn = `${generateFileName("polygon", msg.author.id)}.png`
                                fs.writeFileSync(fn, data.read())
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
                                for(let pos of positions.slice(1)){
                                    let x = parsePosition(pos[0], img.width)
                                    let y = parsePosition(pos[1], img.width)
                                    if(x < minX) minX = x;
                                    if(x > maxX) maxX = x;
                                    if(y < minY) minY = y;
                                    if(y > maxY) maxY = y
                                    ctx.lineTo(x, y)
                                }
                                let width = maxX - minX
                                let height = maxY - minY
                                if(gradient){
                                    let [lastGrad, grad_angle] = gradient.slice(-1)[0].split(":")
                                    grad_angle = parseFloat(grad_angle) * Math.PI / 180
                                    if(!grad_angle) grad_angle = (opts['grad-angle'] || 0.0) * Math.PI / 180
                                    else gradient[gradient.length - 1] = lastGrad
                                    ctx.fillStyle = await createGradient(gradient, grad_angle, startX, startY, width, height, msg, ctx)
                                }
                                else ctx.fillStyle = color
                                ctx.fill()
                                const buffer = canv.toBuffer("image/png")
                                fs.writeFileSync(fn, buffer)
                                msg.channel.send({files: [{attachment: fn, name: fn}]}).then(res => {
                                    fs.rmSync(fn)
                                }).catch(err => {
                                })
                            })
                        }).end()
                        return {
                            content: "generating img"
                        }
                    */
                ];
            });
        }); }
    },
    rect: {
        run: function (msg, args) { return __awaiter(void 0, void 0, void 0, function () {
            var opts, color, outline, img, gradient, _a, x, y, width, height;
            var _b;
            var _c;
            return __generator(this, function (_d) {
                _b = getOpts(args), opts = _b[0], args = _b[1];
                color = opts['color'] || "white";
                outline = opts['outline'];
                img = getImgFromMsgAndOpts(opts, msg);
                if (!img) {
                    return [2 /*return*/, {
                            content: "no img found"
                        }];
                }
                gradient = (_c = opts['gradient']) === null || _c === void 0 ? void 0 : _c.split(">");
                _a = args.slice(0, 4), x = _a[0], y = _a[1], width = _a[2], height = _a[3];
                if (!x) {
                    x = opts['x'] || "0";
                }
                if (!y) {
                    y = opts['y'] || "0";
                }
                if (!width) {
                    width = opts['w'] || opts['width'] || opts['size'] || "50";
                }
                if (!height) {
                    height = opts['h'] || opts['height'] || opts['size'] || width || "50";
                }
                width = parseInt(width) || 50;
                height = parseInt(height) || 50;
                https.request(img, function (resp) {
                    var data = new Stream.Transform();
                    resp.on("data", function (chunk) {
                        data.push(chunk);
                    });
                    resp.on("end", function () { return __awaiter(void 0, void 0, void 0, function () {
                        var fn, oldImg, oldMeta, _a, oldWidth, oldHeight, newImg, _b, composedImg, _c, _d;
                        var _e;
                        return __generator(this, function (_f) {
                            switch (_f.label) {
                                case 0:
                                    fn = generateFileName("rect", msg.author.id) + ".png";
                                    fs.writeFileSync(fn, data.read());
                                    return [4 /*yield*/, sharp(fn).png()];
                                case 1:
                                    oldImg = _f.sent();
                                    return [4 /*yield*/, oldImg.metadata()];
                                case 2:
                                    oldMeta = _f.sent();
                                    _a = [oldMeta.width, oldMeta.height], oldWidth = _a[0], oldHeight = _a[1];
                                    if (!gradient) return [3 /*break*/, 4];
                                    _b = sharp;
                                    return [4 /*yield*/, createGradient(gradient, width, height)];
                                case 3:
                                    newImg = _b.apply(void 0, [_f.sent()]);
                                    return [3 /*break*/, 5];
                                case 4:
                                    newImg = sharp({
                                        create: {
                                            width: width,
                                            height: height,
                                            channels: 4,
                                            background: color
                                        }
                                    });
                                    _f.label = 5;
                                case 5:
                                    _d = (_c = oldImg).composite;
                                    _e = {};
                                    return [4 /*yield*/, newImg.png().toBuffer()];
                                case 6: return [4 /*yield*/, _d.apply(_c, [[(_e.input = _f.sent(), _e.top = parsePosition(y, oldHeight, height), _e.left = parsePosition(x, oldWidth, width), _e)]]).png().toBuffer()
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
                                ];
                                case 7:
                                    composedImg = _f.sent();
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
                                    fs.writeFileSync(fn, composedImg);
                                    msg.channel.send({ files: [{ attachment: fn, name: fn }] }).then(function (res) {
                                        fs.rmSync(fn);
                                    }).catch(function (err) {
                                    });
                                    return [2 /*return*/];
                            }
                        });
                    }); });
                }).end();
                return [2 /*return*/, {
                        content: "generating img"
                    }];
            });
        }); },
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
        }
    },
    scale: {
        run: function (msg, args) { return __awaiter(void 0, void 0, void 0, function () {
            var opts, xScale, yScale, img;
            var _a;
            return __generator(this, function (_b) {
                _a = getOpts(args), opts = _a[0], args = _a[1];
                xScale = args[0] || "2.0";
                yScale = args[1] || "2.0";
                img = getImgFromMsgAndOpts(opts, msg);
                if (!img) {
                    return [2 /*return*/, { content: "no img found" }];
                }
                https.request(img, function (resp) {
                    var data = new Stream.Transform();
                    resp.on("data", function (chunk) {
                        data.push(chunk);
                    });
                    var fn = generateFileName("scale", msg.author.id) + ".png";
                    resp.on("end", function () { return __awaiter(void 0, void 0, void 0, function () {
                        var img, canv, ctx, buffer, err_1;
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0:
                                    fs.writeFileSync(fn, data.read());
                                    return [4 /*yield*/, canvas.loadImage(fn)];
                                case 1:
                                    img = _a.sent();
                                    fs.rmSync(fn);
                                    xScale = Math.min(parsePosition(xScale, img.width, img.width, parseFloat), 2000);
                                    yScale = Math.min(parsePosition(yScale, img.height, img.height, parseFloat), 2000);
                                    canv = new canvas.Canvas(img.width * xScale, img.height * yScale);
                                    ctx = canv.getContext("2d");
                                    ctx.drawImage(img, 0, 0, img.width * xScale, img.height * yScale);
                                    _a.label = 2;
                                case 2:
                                    _a.trys.push([2, 3, , 5]);
                                    buffer = canv.toBuffer("image/png");
                                    return [3 /*break*/, 5];
                                case 3:
                                    err_1 = _a.sent();
                                    return [4 /*yield*/, msg.channel.send("Could not generate image")];
                                case 4:
                                    _a.sent();
                                    return [2 /*return*/];
                                case 5:
                                    fs.writeFileSync(fn, buffer);
                                    msg.channel.send({ files: [{ attachment: fn, name: fn, }] }).then(function (res) {
                                        fs.rmSync(fn);
                                    }).catch(function (err) {
                                    });
                                    return [2 /*return*/];
                            }
                        });
                    }); });
                }).end();
                return [2 /*return*/, {
                        content: "generating img"
                    }];
            });
        }); },
        help: {
            arguments: {
                "scale-width": {
                    description: "The amount to scale the width by"
                },
                'scale-height': {
                    description: 'The amount to scale the height by'
                }
            }
        }
    },
    filter: {
        run: function (msg, args) { return __awaiter(void 0, void 0, void 0, function () {
            var opts, filters, img;
            var _a;
            return __generator(this, function (_b) {
                _a = getOpts(args), opts = _a[0], args = _a[1];
                args = args.join(" ");
                filters = args.split("|");
                img = getImgFromMsgAndOpts(opts, msg);
                if (!img) {
                    return [2 /*return*/, { content: "no img found" }];
                }
                https.request(img, function (resp) {
                    var data = new Stream.Transform();
                    resp.on("data", function (chunk) {
                        data.push(chunk);
                    });
                    var fn = generateFileName("scale", msg.author.id) + ".png";
                    resp.on("end", function () { return __awaiter(void 0, void 0, void 0, function () {
                        var img, canv, ctx, buffer, jimpImg, _i, filters_1, filter, args_2;
                        var _a;
                        return __generator(this, function (_b) {
                            switch (_b.label) {
                                case 0:
                                    fs.writeFileSync(fn, data.read());
                                    return [4 /*yield*/, canvas.loadImage(fn)];
                                case 1:
                                    img = _b.sent();
                                    fs.rmSync(fn);
                                    canv = new canvas.Canvas(img.width, img.height);
                                    ctx = canv.getContext("2d");
                                    ctx.drawImage(img, 0, 0, img.width, img.height);
                                    buffer = canv.toBuffer("image/png");
                                    return [4 /*yield*/, jimp.read(buffer)];
                                case 2:
                                    jimpImg = _b.sent();
                                    _i = 0, filters_1 = filters;
                                    _b.label = 3;
                                case 3:
                                    if (!(_i < filters_1.length)) return [3 /*break*/, 6];
                                    filter = filters_1[_i];
                                    args_2 = void 0;
                                    _a = filter.split(":"), filter = _a[0], args_2 = _a[1];
                                    return [4 /*yield*/, applyJimpFilter(jimpImg, filter, args_2)];
                                case 4:
                                    jimpImg = _b.sent();
                                    _b.label = 5;
                                case 5:
                                    _i++;
                                    return [3 /*break*/, 3];
                                case 6: return [4 /*yield*/, jimpImg.getBufferAsync("image/png")];
                                case 7:
                                    buffer = _b.sent();
                                    fs.writeFileSync(fn, buffer);
                                    msg.channel.send({ files: [{ attachment: fn, name: fn, }] }).then(function (res) {
                                        fs.rmSync(fn);
                                    }).catch(function (err) {
                                    });
                                    return [2 /*return*/];
                            }
                        });
                    }); });
                }).end();
                return [2 /*return*/, {
                        content: "generating img"
                    }];
            });
        }); },
        help: {
            info: "Filters:<br>rotate[:angle]<br>flip[:hor|vert]<br>brightness[:val]<br>grey|greyscale|gray|grayscale<br>invert<br>contrast[:val]",
            arguments: {
                filter: {
                    description: "The filters to use, each filter is seperated by |"
                }
            }
        }
    },
    /*
    text: {
        run: async(msg: typeof Message, args: ArgumentList) => {
            let opts
            [opts, args] = getOpts(args)
            let img = getImgFromMsgAndOpts(opts, msg)
            if(!img){
                return {content: "no img found"}
            }
            let size = opts["size"] || "20x"
            let font = opts["font"] || "Arial"
            let color = opts["color"] || "red"
            let rotation = opts['rotate'] || opts['angle'] || "0.0"
            rotation = parseFloat(rotation)
            let x = opts["x"] || "0"
            let y = opts["y"] || "0"

            let fn = `${generateFileName("text", msg.author.id)}.png`

            https.request(img, resp => {
                let data = new Stream.Transform()
                resp.on("data", chunk => {
                    data.push(chunk)
                })
                resp.on("end", async() => {
            let img = sharp(data.read())
            let imgMeta = await img.metadata()
            let [width, height] = [imgMeta.width, imgMeta.height]
            let svg = `<svg><text x="0" y="0" font-size="${size}" style="font-family: ${font}" fill="${color}">${args.join(" ").trim() || "?"}</text></svg>`
            console.log(svg)
            let newText = sharp(Buffer.from(svg))
            let textMeta = await newText.metadata()
            let [textW, textH] = [textMeta.width, textMeta.height]
            /*
                    ctx.drawImage(img, 0, 0, img.width, img.height)
                    ctx.font = `${size} ${font}`
                    ctx.fillStyle = color
                    let textInfo = ctx.measureText(args.join(" ").trim() || "?")
                    let [textW, textH] = [textInfo.width, textInfo.emHeightAscent]
                    x = parsePosition(x, width, textW)
                    y = parsePosition(y, height, textH)
            let buffer = await img.composite([{input: await newText.png().toBuffer(), top: y, left: x}]).png().toBuffer()
                    fs.writeFileSync(fn, buffer)
                    msg.channel.send({files: [{attachment: fn, name: fn,}]}).then(res => {
                        fs.rmSync(fn)
                    }).catch(err => {
                    })
                })
            }).end()
            return {
                content: "generating img"
            }
        },
        help: {
            info: "Put text on an image",
            arguments: {
                text: {
                    description: "The text to put",
                    required: true
                },
                img: {
                    description: "Image file to use"
                }
            },
            options: {
                img: {
                    description: "Link to image to use"
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
                }
            }
        }
    },
    */
    choose: {
        run: function (msg, args) { return __awaiter(void 0, void 0, void 0, function () {
            var opts, times, sep, ans, i;
            var _a;
            return __generator(this, function (_b) {
                _a = getOpts(args), opts = _a[0], args = _a[1];
                times = 1;
                sep = String(opts["sep"] || opts["s"] || "\n");
                if (opts["times"] || opts["t"]) {
                    times = parseInt(opts["t"]);
                }
                ans = [];
                args = args.join(" ").split("|");
                for (i = 0; i < times; i++) {
                    ans.push(args[Math.floor(Math.random() * args.length)].trim());
                }
                return [2 /*return*/, {
                        content: ans.join(sep) || "```invalid message```"
                    }];
            });
        }); }
    },
    weather: {
        run: function (msg, args) { return __awaiter(void 0, void 0, void 0, function () {
            var url, town;
            return __generator(this, function (_a) {
                url = "https://www.wttr.in";
                town = args.join(" ") || "tokyo";
                https.request(url + "/" + encodeURI(town) + "?format=1", function (resp) {
                    var data = new Stream.Transform();
                    resp.on("data", function (chunk) {
                        data.push(chunk);
                    });
                    resp.on('end', function () { return __awaiter(void 0, void 0, void 0, function () {
                        var tempData, condition, temp, unit, err_2, tempC, tempF, color, embed;
                        var _a;
                        return __generator(this, function (_b) {
                            switch (_b.label) {
                                case 0:
                                    data = data.read().toString();
                                    tempData = data.match(/(\S*)\s*[+-](\d+).(C|F)/);
                                    _b.label = 1;
                                case 1:
                                    _b.trys.push([1, 2, , 4]);
                                    _a = tempData.slice(1, 4), condition = _a[0], temp = _a[1], unit = _a[2];
                                    return [3 /*break*/, 4];
                                case 2:
                                    err_2 = _b.sent();
                                    return [4 /*yield*/, msg.channel.send({ content: "Could not find weather :(" })];
                                case 3:
                                    _b.sent();
                                    return [2 /*return*/];
                                case 4:
                                    temp = Number(temp);
                                    if (unit == "C") {
                                        tempF = temp * 9 / 5 + 32;
                                        tempC = temp;
                                    }
                                    else if (unit == "F") {
                                        tempC = (temp - 32) * 5 / 9;
                                        tempF = temp;
                                    }
                                    color = "DARK_BUT_NOT_BLACK";
                                    if (tempF >= 110)
                                        color = "#aa0000";
                                    if (tempF < 110)
                                        color = "#ff0000";
                                    if (tempF < 100)
                                        color = "#ff412e";
                                    if (tempF < 90)
                                        color = "ORANGE";
                                    if (tempF < 75)
                                        color = "YELLOW";
                                    if (tempF < 60)
                                        color = "GREEN";
                                    if (tempF < 45)
                                        color = "BLUE";
                                    if (tempF < 32)
                                        color = "#5be6ff";
                                    if (tempF < 0)
                                        color = "PURPLE";
                                    embed = new MessageEmbed();
                                    embed.setTitle(town);
                                    embed.setColor(color);
                                    embed.addField("condition", condition, false);
                                    embed.addField("Temp F", tempF + "F", true);
                                    embed.addField("Temp C", tempC + "C", true);
                                    embed.setFooter({ text: "For more info, visit " + url + "/" + encodeURI(town) });
                                    return [4 /*yield*/, msg.channel.send({ embeds: [embed] })];
                                case 5:
                                    _b.sent();
                                    return [2 /*return*/];
                            }
                        });
                    }); });
                }).end();
                return [2 /*return*/, {
                        content: 'getting weather'
                    }];
            });
        }); },
        help: {
            info: "Get weather for a specific place, default: tokyo",
            arguments: {
                "location": {
                    description: "Where do you want the weather for"
                }
            }
        }
    },
    rotate: {
        run: function (msg, args) { return __awaiter(void 0, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, commands['filter'].run(msg, ["rotate:" + args[0] + "," + args[1]])];
            });
        }); }
    },
    color: {
        run: function (msg, args) { return __awaiter(void 0, void 0, void 0, function () {
            var opts, color, colors, width, height, content, fn, buffer, gradient, colorStrings, i, R, G, B, _a, _b, R, G, B;
            var _c, _d;
            return __generator(this, function (_e) {
                switch (_e.label) {
                    case 0:
                        _c = getOpts(args), opts = _c[0], args = _c[1];
                        args = args.join(" ");
                        color = args || "RANDOM";
                        colors = args.split(">");
                        width = Math.min(parseInt(opts['w']) || 250, 2000);
                        height = Math.min(parseInt(opts['h']) || 250, 2000);
                        content = color;
                        fn = generateFileName("color", msg.author.id) + ".png";
                        if (!(colors.length > 1)) return [3 /*break*/, 3];
                        gradient = [];
                        colorStrings = [];
                        for (i = 0; i < Math.min(colors.length, 1e9); i++) {
                            R = void 0, G = void 0, B = void 0;
                            if (colors[i]) {
                                colorStrings.push(colors[i]);
                                gradient.push(colors[i]);
                            }
                            else {
                                _d = randomColor(), R = _d[0], G = _d[1], B = _d[2];
                                gradient.push("rgb(" + R + ", " + G + ", " + B + ")");
                                colorStrings.push(rgbToHex(R, G, B));
                            }
                        }
                        _a = sharp;
                        return [4 /*yield*/, createGradient(gradient, width, height)];
                    case 1: return [4 /*yield*/, _a.apply(void 0, [_e.sent()]).png().toBuffer()];
                    case 2:
                        buffer = _e.sent();
                        content = colorStrings.join(" > ");
                        return [3 /*break*/, 5];
                    case 3:
                        if (color == "RANDOM") {
                            _b = randomColor(), R = _b[0], G = _b[1], B = _b[2];
                            color = "rgb(" + R + ", " + G + ", " + B + ")";
                            content = rgbToHex(R, G, B);
                        }
                        return [4 /*yield*/, sharp({ create: {
                                    width: width,
                                    height: height,
                                    channels: 4,
                                    background: color
                                } }).png().toBuffer()];
                    case 4:
                        buffer = _e.sent();
                        _e.label = 5;
                    case 5:
                        fs.writeFileSync(fn, buffer);
                        return [2 /*return*/, {
                                files: [
                                    {
                                        attachment: fn,
                                        name: "file.png",
                                        description: "why can i describe this"
                                    }
                                ],
                                content: content
                            }];
                }
            });
        }); },
        help: {
            info: "Generate a random color",
            arguments: {
                "color": {
                    description: "The color to generate, can also be >, which will create a gradient"
                }
            },
            options: {
                "width": {
                    description: "width of image"
                },
                "height": {
                    description: "height of image"
                }
            }
        }
    },
    "l-bl": {
        run: function (msg, args) { return __awaiter(void 0, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, {
                        content: fs.readFileSync("command-perms/blacklists", "utf-8")
                    }];
            });
        }); }
    },
    "l-wl": {
        run: function (msg, args) { return __awaiter(void 0, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, {
                        content: fs.readFileSync("command-perms/whitelists", "utf-8")
                    }];
            });
        }); }
    },
    spam: {
        run: function (msg, args) { return __awaiter(void 0, void 0, void 0, function () {
            var times, send, id;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        times = parseInt(args[0]);
                        if (times) {
                            args.splice(0, 1);
                        }
                        else
                            times = 10;
                        send = args.join(" ").trim();
                        if (send == "") {
                            send = String(times);
                            times = 10;
                        }
                        id = String(Math.floor(Math.random() * 100000000));
                        return [4 /*yield*/, msg.channel.send("starting " + id)];
                    case 1:
                        _a.sent();
                        SPAMS[id] = true;
                        _a.label = 2;
                    case 2:
                        if (!(SPAMS[id] && times--)) return [3 /*break*/, 5];
                        return [4 /*yield*/, msg.channel.send(send)];
                    case 3:
                        _a.sent();
                        return [4 /*yield*/, new Promise(function (res) { return setTimeout(res, Math.random() * 700 + 200); })];
                    case 4:
                        _a.sent();
                        return [3 /*break*/, 2];
                    case 5: return [2 /*return*/, {
                            content: "done"
                        }];
                }
            });
        }); }
    },
    stop: {
        run: function (msg, args) { return __awaiter(void 0, void 0, void 0, function () {
            var spam;
            return __generator(this, function (_a) {
                if (!Object.keys(SPAMS).length) {
                    return [2 /*return*/, {}];
                }
                if (args[0]) {
                    if (SPAMS[args[0]]) {
                        delete SPAMS[args[0]];
                        return [2 /*return*/, {
                                content: "stopping " + args[0]
                            }];
                    }
                    return [2 /*return*/, {
                            content: args[0] + " is not a spam id"
                        }];
                }
                SPAM_ALLOWED = false;
                for (spam in SPAMS) {
                    delete SPAMS[spam];
                }
                return [2 /*return*/, {
                        content: "stopping all"
                    }];
            });
        }); }
    },
    "var": {
        run: function (msg, args) { return __awaiter(void 0, void 0, void 0, function () {
            var name, value;
            var _a;
            return __generator(this, function (_b) {
                _a = args.join(" ").split("="), name = _a[0], value = _a[1];
                vars[name] = function () { return value; };
                return [2 /*return*/, {
                        content: vars[name]()
                    }];
            });
        }); },
        help: {
            arguments: {
                "name=value": {
                    description: "name is the variable name, value is the value",
                    required: true
                }
            }
        }
    },
    remove: {
        run: function (msg, args) { return __awaiter(void 0, void 0, void 0, function () {
            var file, data, options, fn, m, num, removal, userCreated, err_3;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        file = FILE_SHORTCUTS[args[0]] || args[0];
                        if (!file) {
                            return [2 /*return*/, {
                                    content: "Nothing given to add to"
                                }];
                        }
                        if (file.match(/[\.]/)) {
                            return [2 /*return*/, {
                                    content: "invalid command"
                                }];
                        }
                        if (!fs.existsSync("./command-results/" + file)) {
                            return [2 /*return*/, {
                                    content: "file does not exist"
                                }];
                        }
                        data = fs.readFileSync("./command-results/" + file, "utf-8").split(";END");
                        options = data.map(function (value, i) { return value.trim() ? i + 1 + ":\t" + value.trim() : ""; });
                        fn = generateFileName("remove", msg.author.id);
                        fs.writeFileSync(fn, options.join("\n"));
                        return [4 /*yield*/, msg.channel.send({
                                content: "Say the number of what you want to remove, or type cancel",
                                files: [{
                                        attachment: fn,
                                        name: "remove.txt"
                                    }]
                            })];
                    case 1:
                        _a.sent();
                        fs.rmSync(fn);
                        _a.label = 2;
                    case 2:
                        _a.trys.push([2, 6, , 7]);
                        return [4 /*yield*/, msg.channel.awaitMessages({ filter: function (m) { return m.author.id == msg.author.id; }, max: 1, time: 30000, errors: ['time'] })];
                    case 3:
                        m = _a.sent();
                        if (['cancel', 'c'].includes(m.at(0).content)) {
                            return [2 /*return*/, {
                                    content: "cancelled"
                                }];
                        }
                        num = parseInt(m.at(0).content);
                        if (!!num) return [3 /*break*/, 5];
                        return [4 /*yield*/, msg.channel.send(num + " is not a valid number")];
                    case 4:
                        _a.sent();
                        _a.label = 5;
                    case 5:
                        removal = data[num - 1];
                        userCreated = removal.split(":")[0].trim();
                        if (userCreated != msg.author.id && ADMINS.indexOf(msg.author.id) < 0) {
                            return [2 /*return*/, {
                                    content: "You did not create that message, and are not a bot admin"
                                }];
                        }
                        data.splice(num - 1, 1);
                        fs.writeFileSync("command-results/" + file, data.join(";END"));
                        return [2 /*return*/, {
                                content: "removed " + removal + " from " + file
                            }];
                    case 6:
                        err_3 = _a.sent();
                        return [2 /*return*/, {
                                content: "didnt respond in time"
                            }];
                    case 7: return [2 /*return*/];
                }
            });
        }); },
        help: {
            arguments: {
                file: {
                    description: "The command file to remove from",
                    required: true
                }
            }
        }
    },
    "command-file": {
        run: function (msg, args) { return __awaiter(void 0, void 0, void 0, function () {
            var opts, file;
            var _a;
            return __generator(this, function (_b) {
                _a = getOpts(args), opts = _a[0], args = _a[1];
                if (opts["l"]) {
                    return [2 /*return*/, {
                            content: "```\n" + fs.readdirSync("./command-results").join("\n") + "\n```\n"
                        }];
                }
                file = FILE_SHORTCUTS[args[0]] || args[0];
                if (!file) {
                    return [2 /*return*/, {
                            content: "Nothing given to add to"
                        }];
                }
                if (!fs.existsSync("./command-results/" + file)) {
                    return [2 /*return*/, {
                            content: "file does not exist"
                        }];
                }
                return [2 /*return*/, {
                        files: [
                            {
                                attachment: "./command-results/" + file,
                                name: file + ".txt",
                                description: "data for " + file,
                                delete: false
                            }
                        ]
                    }];
            });
        }); },
        help: {
            arguments: {
                file: {
                    description: "the file to see"
                }
            }
        }
    },
    add: {
        run: function (msg, args) { return __awaiter(void 0, void 0, void 0, function () {
            var file, data;
            return __generator(this, function (_a) {
                file = FILE_SHORTCUTS[args[0]] || args[0];
                if (!file) {
                    return [2 /*return*/, {
                            content: "Nothing given to add to"
                        }];
                }
                if (file.match(/[\.]/)) {
                    return [2 /*return*/, {
                            content: "invalid command"
                        }];
                }
                if (!fs.existsSync("./command-results/" + file)) {
                    return [2 /*return*/, {
                            content: "file does not exist"
                        }];
                }
                args = args.slice(1);
                data = args === null || args === void 0 ? void 0 : args.join(" ");
                if (!data) {
                    return [2 /*return*/, {
                            content: "No data given"
                        }];
                }
                fs.appendFileSync("./command-results/" + file, msg.author.id + ": " + data + ";END\n");
                return [2 /*return*/, {
                        content: "appended `" + data + "` to `" + file + "`"
                    }];
            });
        }); },
        help: {
            arguments: {
                "file": {
                    description: "The command file list to add to",
                    required: true
                },
                "data": {
                    description: "The text to add to the file",
                    required: true,
                    requires: "file"
                }
            }
        }
    },
    "8": {
        run: function (msg, args) { return __awaiter(void 0, void 0, void 0, function () {
            var content, options;
            return __generator(this, function (_a) {
                content = args.join(" ");
                options = fs.readFileSync("./command-results/8ball", "utf-8").split(";END").slice(0, -1);
                return [2 /*return*/, {
                        content: options[Math.floor(Math.random() * options.length)]
                            .slice(20)
                            .replaceAll("{content}", content)
                            .replaceAll("{u}", "" + msg.author)
                    }];
            });
        }); },
        help: {
            info: "<code>[8 question</code><br>for the <code>[add</code> command, <code>{u}</code> represents user using this command, and <code>{content}</code> is their question",
            arguments: {
                question: {
                    description: "What is on your mind?"
                }
            }
        }
    },
    distance: {
        run: function (msg, args) { return __awaiter(void 0, void 0, void 0, function () {
            var opts, speed, _a, from, to, fromUser, toUser, options, url, resp, $, text, drivingDistText, drivingDist, straightLineText, straightLineDist, embed, options;
            var _b;
            var _c, _d;
            return __generator(this, function (_e) {
                switch (_e.label) {
                    case 0:
                        _b = getOpts(args), opts = _b[0], args = _b[1];
                        speed = opts['speed'];
                        args = args.join(" ");
                        _a = args.split("|"), from = _a[0], to = _a[1];
                        if (!to) {
                            return [2 /*return*/, { content: "No second place given, fmt: `place 1 | place 2`" }];
                        }
                        return [4 /*yield*/, fetchUser(msg.guild, from)];
                    case 1:
                        fromUser = _e.sent();
                        return [4 /*yield*/, fetchUser(msg.guild, to)];
                    case 2:
                        toUser = _e.sent();
                        if (fromUser && toUser) {
                            options = fs.readFileSync("./command-results/distance-easter-egg", "utf-8").split(';END').slice(0, -1);
                            return [2 /*return*/, {
                                    content: options[Math.floor(Math.random() * options.length)]
                                        .slice(20)
                                        .replaceAll("{from}", fromUser.id)
                                        .replaceAll("{to}", toUser.id)
                                        .replaceAll("{f}", "" + fromUser)
                                        .replaceAll("{t}", "" + toUser)
                                        .trim()
                                }];
                        }
                        from = encodeURI(from.trim());
                        to = encodeURI(to.trim());
                        url = "https://www.travelmath.com/distance/from/" + from + "/to/" + to;
                        return [4 /*yield*/, got(url, {
                                headers: {
                                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Safari/537.36",
                                }
                            })];
                    case 3:
                        resp = _e.sent();
                        $ = cheerio.load(resp.body);
                        text = $("p.home2").text();
                        drivingDistText = text.match(/The total driving distance from [^\.]* is ([\d,]*) miles/);
                        drivingDist = 0;
                        if (drivingDistText) {
                            drivingDist = parseInt((_c = drivingDistText[1]) === null || _c === void 0 ? void 0 : _c.replaceAll(",", ""));
                        }
                        straightLineText = text.match(/The total straight line flight distance from [^\.]* is ([\d,]*) miles/);
                        straightLineDist = 0;
                        if (straightLineText) {
                            straightLineDist = parseInt((_d = straightLineText[1]) === null || _d === void 0 ? void 0 : _d.replaceAll(",", ""));
                        }
                        embed = new MessageEmbed();
                        embed.setTitle("Distances");
                        if (drivingDist) {
                            embed.addField("Driving distance", drivingDist + " miles");
                            if (speed)
                                embed.addField("Driving distance time", drivingDist / speed + " hours");
                        }
                        if (straightLineDist) {
                            embed.addField("Straight line distance", straightLineDist + " miles");
                            if (speed)
                                embed.addField("Straight line distance time", straightLineDist / speed + " hours");
                        }
                        if (!drivingDist && !straightLineDist) {
                            options = fs.readFileSync("./command-results/distance-easter-egg", "utf-8").split(';END').slice(0, -1);
                            return [2 /*return*/, {
                                    content: options[Math.floor(Math.random() * options.length)]
                                        .slice(20)
                                        .replaceAll("{from}", from)
                                        .replaceAll("{to}", to)
                                        .replaceAll("{f}", decodeURI(from))
                                        .replaceAll("{t}", decodeURI(to))
                                        .trim()
                                }];
                        }
                        return [2 /*return*/, {
                                embeds: [embed]
                            }];
                }
            });
        }); },
        help: {
            arguments: {
                "city 1": {
                    "description": "The starting city, seperate the cities with |",
                    "required": true
                },
                "city 2": {
                    "description": "The ending city, seperate the cities with |",
                    required: true
                }
            }
        }
    },
    "list-cmds": {
        run: function (msg, args) { return __awaiter(void 0, void 0, void 0, function () {
            var values, cmd;
            return __generator(this, function (_a) {
                values = '';
                for (cmd in commands) {
                    values += cmd + "\n";
                }
                return [2 /*return*/, {
                        content: values
                    }];
            });
        }); }
    },
    help: {
        run: function (msg, args) { return __awaiter(void 0, void 0, void 0, function () {
            var opts, files, commandsToUse, _i, args_3, cmd, styles, html, skip, cmd, exts, fmt, ext, content;
            var _a;
            var _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        _a = getOpts(args), opts = _a[0], args = _a[1];
                        if (opts["g"]) {
                            return [2 /*return*/, { content: "```\n[command [args...]\nescapes:\n    \\n: new line\n    \\t: tab\n    \\U{hex}: unicode\n    \\u{hex}: unicode\n    \\s: space\n    \\s{text}: all the text inside is treated as 1 argument\n    \\b{text}: bold\n    \\i{text}: italic\n    \\S{text}: strikethrough\n    \\d{date}: date\n    \\D{unix timestamp}: date from timestamp\n    \\V{variable name}: value of a variable\n    \\\\: backslash\nformats:\n    {user}: mention yourself\n    {arg}: give back the current text that prefixes {arg}\nvariables:\n    random: random number\n    rand: random number\n    prefix: bot's prefix\n    vcount: variable count\n    sender: mention yourself\n    you may also define custom variables like: [var x=y\n        or [var x=\\s{this is a long variable}\n```\n" }];
                        }
                        files = [];
                        commandsToUse = commands;
                        if (args[0]) {
                            commandsToUse = {};
                            if (args[0] == "?") {
                                commandsToUse = commands;
                            }
                            else {
                                for (_i = 0, args_3 = args; _i < args_3.length; _i++) {
                                    cmd = args_3[_i];
                                    if (!commands[cmd])
                                        continue;
                                    commandsToUse[cmd] = commands[cmd];
                                }
                            }
                        }
                        if (Object.keys(commandsToUse).length < 1) {
                            return [2 /*return*/, {
                                    content: "No help can be given :("
                                }];
                        }
                        if (!(!fs.existsSync("help.html") || opts["n"] || args.length > 0)) return [3 /*break*/, 2];
                        return [4 /*yield*/, msg.channel.send("generating new help file")];
                    case 1:
                        _c.sent();
                        styles = fs.readFileSync("help-styles.css");
                        html = "<style>\n" + styles + "\n</style>";
                        skip = [];
                        for (cmd in commandsToUse) {
                            if (skip.includes(cmd))
                                continue;
                            if ((_b = commands[cmd]["help"]) === null || _b === void 0 ? void 0 : _b.aliases) {
                                skip = skip.concat(commands[cmd].help.aliases);
                            }
                            html += generateHTMLFromCommandHelp(cmd, commands[cmd]);
                        }
                        fs.writeFileSync("help.html", html);
                        _c.label = 2;
                    case 2:
                        if (opts["p"] || opts['t']) {
                            opts["plain"] = true;
                        }
                        if (opts["m"]) {
                            opts["markdown"] = true;
                        }
                        if (opts["h"] || opts["html"] || Object.keys(opts).length === 0) {
                            files.push({
                                attachment: "help.html",
                                name: "help.html",
                                description: "help",
                                delete: false
                            });
                            if (opts["h"])
                                delete opts["h"];
                            if (opts["html"])
                                delete opts["html"];
                        }
                        exts = {
                            "plain": "txt",
                            "markdown": "md",
                            "man": "1",
                            "commonmark": "md"
                        };
                        for (fmt in opts) {
                            if (fmt.length == 1)
                                continue;
                            if (!fmt.match(/^\w+$/))
                                continue;
                            ext = exts[fmt] || fmt;
                            try {
                                execSync("pandoc -o output." + ext + " -fhtml -t" + fmt + " help.html");
                            }
                            catch (err) {
                                continue;
                            }
                            files.push({
                                attachment: "output." + ext,
                                name: "help." + ext,
                                description: "help"
                            });
                        }
                        if (fs.existsSync("output.txt")) {
                            content = fs.readFileSync("output.txt", "utf-8");
                            fs.rmSync('output.txt');
                            return [2 /*return*/, {
                                    content: "```\n" + content + "\n```"
                                }];
                        }
                        if (files.length > 0) {
                            return [2 /*return*/, {
                                    files: files
                                }];
                        }
                        return [2 /*return*/, {
                                content: "cannot send an empty file"
                            }];
                }
            });
        }); },
        help: {
            options: {
                "p": {
                    "description": "give a plain text file intead of html"
                },
                "m": {
                    "description": "give a markdown file instead of html"
                },
                "n": {
                    "description": "forcefully generate a new help file"
                },
                "g": {
                    "description": "show the syntax of the bot"
                },
                "*": {
                    "description": "any format that pandoc allows, if you're curious, look up \"pandoc formats\""
                }
            }
        }
    },
    code: {
        run: function (msg, args) { return __awaiter(void 0, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, {
                        content: "https://github.com/euro20179/bircle"
                    }];
            });
        }); }
    },
    WHITELIST: {
        run: function (msg, args) { return __awaiter(void 0, void 0, void 0, function () {
            var user, addOrRemove, cmds;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        user = args[0];
                        if (!user) {
                            return [2 /*return*/, {
                                    content: "no user given"
                                }];
                        }
                        addOrRemove = args[1];
                        if (!["a", "r"].includes(addOrRemove)) {
                            return [2 /*return*/, {
                                    content: "did not specify, (a)dd or (r)emove"
                                }];
                        }
                        cmds = args.slice(2);
                        if (!cmds.length) {
                            return [2 /*return*/, {
                                    content: "no cmd given"
                                }];
                        }
                        return [4 /*yield*/, fetchUser(msg.guild, user)];
                    case 1:
                        user = _a.sent();
                        if (addOrRemove == "a") {
                            addToPermList(WHITELIST, "whitelists", user, cmds);
                            return [2 /*return*/, {
                                    content: user + " has been whitelisted to use " + cmds.join(" ")
                                }];
                        }
                        else {
                            removeFromPermList(WHITELIST, "whitelists", user, cmds);
                            return [2 /*return*/, {
                                    content: user + " has been removed from the whitelist of " + cmds.join(" ")
                                }];
                        }
                        return [2 /*return*/];
                }
            });
        }); },
        permCheck: function (msg) {
            return ADMINS.includes(msg.author.id);
        }
    },
    BLACKLIST: {
        run: function (msg, args) { return __awaiter(void 0, void 0, void 0, function () {
            var user, addOrRemove, cmds;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        user = args[0];
                        if (!user) {
                            return [2 /*return*/, {
                                    content: "no user given"
                                }];
                        }
                        addOrRemove = args[1];
                        if (!["a", "r"].includes(addOrRemove)) {
                            return [2 /*return*/, {
                                    content: "did not specify, (a)dd or (r)emove"
                                }];
                        }
                        cmds = args.slice(2);
                        if (!cmds.length) {
                            return [2 /*return*/, {
                                    content: "no cmd given"
                                }];
                        }
                        return [4 /*yield*/, fetchUser(msg.guild, user)];
                    case 1:
                        user = _a.sent();
                        if (addOrRemove == "a") {
                            addToPermList(BLACKLIST, "blacklists", user, cmds);
                            return [2 /*return*/, {
                                    content: user + " has been blacklisted from " + cmds.join(" ")
                                }];
                        }
                        else {
                            removeFromPermList(BLACKLIST, "blacklists", user, cmds);
                            return [2 /*return*/, {
                                    content: user + " has been removed from the blacklist of " + cmds.join(" ")
                                }];
                        }
                        return [2 /*return*/];
                }
            });
        }); },
        permCheck: function (msg) {
            return ADMINS.includes(msg.author.id);
        }
    },
    END: {
        run: function (msg, args) { return __awaiter(void 0, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, msg.channel.send("STOPPING")];
                    case 1:
                        _a.sent();
                        client.destroy();
                        return [2 /*return*/, {
                                content: "STOPPING"
                            }];
                }
            });
        }); },
        permCheck: function (msg) {
            return ADMINS.includes(msg.author.id);
        }
    },
    "rand-user": {
        run: function (msg, args) { return __awaiter(void 0, void 0, void 0, function () {
            var opts, member, fmt, user;
            var _a;
            var _b, _c;
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0:
                        _a = getOpts(args), opts = _a[0], args = _a[1];
                        if (!opts['f'])
                            member = msg.channel.guild.members.cache.random();
                        if (!!member) return [3 /*break*/, 2];
                        return [4 /*yield*/, msg.channel.guild.members.fetch()];
                    case 1:
                        member = (_d.sent()).random();
                        _d.label = 2;
                    case 2:
                        fmt = args.join(" ") || "%u (%n)";
                        user = member.user;
                        return [2 /*return*/, {
                                content: format(fmt
                                    .replaceAll("{id}", user.id || "#!N/A")
                                    .replaceAll("{username}", user.username || "#!N/A")
                                    .replaceAll("{nickname}", member.nickName || "#!N/A")
                                    .replaceAll("{0xcolor}", member.displayHexColor.toString() || "#!N/A")
                                    .replaceAll("{color}", member.displayColor.toString() || "#!N/A")
                                    .replaceAll("{created}", user.createdAt.toString() || "#!N/A")
                                    .replaceAll("{joined}", member.joinedAt.toString() || "#!N/A")
                                    .replaceAll("{boost}", ((_b = member.premiumSince) === null || _b === void 0 ? void 0 : _b.toString()) || "#!N/A"), {
                                    i: user.id || "#!N/A",
                                    u: user.username || "#!N/A",
                                    n: member.nickName || "#!N/A",
                                    X: member.displayHexColor.toString() || "#!N/A",
                                    x: member.displayColor.toString() || "#!N/A",
                                    c: user.createdAt.toString() || "#!N/A",
                                    j: member.joinedAt.toString() || "#!N/A",
                                    b: ((_c = member.premiumSince) === null || _c === void 0 ? void 0 : _c.toString()) || "#!N/A"
                                })
                            }];
                }
            });
        }); },
        help: {
            info: "Gives a random server member",
            arguments: {
                "fmt": {
                    description: "The format to print the user, default: \"%u (%n)\"<br>Formats:<br>%i: user id<br>%u: username<br>%n: nickname<br>%X: hex color<br>%x: color<br>%c: Created at<br>%j: Joined at<br>%b: premium since"
                }
            },
            options: {
                "f": {
                    description: "Fetch all members in guild, instead of using preloaded members"
                }
            }
        }
    },
    "user-info": {
        run: function (msg, args) { return __awaiter(void 0, void 0, void 0, function () {
            var member, user, fmt, embed;
            var _a, _b, _c;
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0:
                        if (!args[0]) {
                            return [2 /*return*/, {
                                    content: "no member given!"
                                }];
                        }
                        return [4 /*yield*/, fetchUser(msg.guild, args[0])];
                    case 1:
                        member = _d.sent();
                        if (!member) {
                            return [2 /*return*/, {
                                    content: "member not found"
                                }];
                        }
                        user = member.user;
                        if (args[1]) {
                            fmt = args.slice(1).join(" ");
                            return [2 /*return*/, {
                                    content: format(fmt
                                        .replaceAll("{id}", user.id || "#!N/A")
                                        .replaceAll("{username}", user.username || "#!N/A")
                                        .replaceAll("{nickname}", member.nickName || "#!N/A")
                                        .replaceAll("{0xcolor}", member.displayHexColor.toString() || "#!N/A")
                                        .replaceAll("{color}", member.displayColor.toString() || "#!N/A")
                                        .replaceAll("{created}", user.createdAt.toString() || "#!N/A")
                                        .replaceAll("{joined}", member.joinedAt.toString() || "#!N/A")
                                        .replaceAll("{boost}", ((_a = member.premiumSince) === null || _a === void 0 ? void 0 : _a.toString()) || "#!N/A"), {
                                        i: user.id || "#!N/A",
                                        u: user.username || "#!N/A",
                                        n: member.nickName || "#!N/A",
                                        X: member.displayHexColor.toString() || "#!N/A",
                                        x: member.displayColor.toString() || "#!N/A",
                                        c: user.createdAt.toString() || "#!N/A",
                                        j: member.joinedAt.toString() || "#!N/A",
                                        b: ((_b = member.premiumSince) === null || _b === void 0 ? void 0 : _b.toString()) || "#!N/A"
                                    })
                                }];
                        }
                        embed = new MessageEmbed();
                        embed.setColor(member.displayColor);
                        embed.setThumbnail(user.avatarURL());
                        embed.addField("Id", user.id || "#!N/A", true);
                        embed.addField("Username", user.username || "#!N/A", true);
                        embed.addField("Nickname", member.nickName || "#!N/A", true);
                        embed.addField("0xColor", member.displayHexColor.toString() || "#!N/A", true);
                        embed.addField("Color", member.displayColor.toString() || "#!N/A", true);
                        embed.addField("Created at", user.createdAt.toString() || "#!N/A", true);
                        embed.addField("Joined at", member.joinedAt.toString() || "#!N/A", true);
                        embed.addField("Boosting since", ((_c = member.premiumSince) === null || _c === void 0 ? void 0 : _c.toString()) || "#!N/A", true);
                        return [2 /*return*/, {
                                embeds: [embed]
                            }];
                }
            });
        }); },
        help: {
            info: "[user-info &lt;user&gt; [format]<br>\nvalid formats:<br>\n<ul>\n    <li>\n    <code>{id}</code> or <code>{i}</code> or <code>%i</code>: user id\n    </li>\n    <li>\n    <code>{username}</code> or <code>{u}</code> or <code>%u</code>: user username\n    </li>\n    <li>\n    <code>{nickname}</code> or <code>{n}</code> or <code>%n</code>: user nickname\n    </li>\n    <li>\n    <code>{0xcolor}</code> or <code>{X}</code> or <code>%X</code>: user color in hex\n    </li>\n    <li>\n    <code>{color}</code> or <code>{x}</code> or <code>%x</code>: user color\n    </li>\n    <li>\n    <code>{created}</code> or <code>{c}</code> or <code>%c</code>: when the user was created\n    </li>\n    <li>\n    <code>{joined}</code> or <code>{j}</code> or <code>%j</code>: when the user joined the server\n    </li>\n    <li>\n    <code>{boost}</code> or <code>{b}</code> or <code>%b</code>: when the user started boosting the server\n    </li>\n</ul>",
            aliases: []
        }
    },
    "cmd-use": {
        run: function (msg, args) { return __awaiter(void 0, void 0, void 0, function () {
            var data;
            return __generator(this, function (_a) {
                data = generateCmdUseFile()
                    .split("\n")
                    .map(function (v) { return v.split(":"); }) //map into 2d array, idx[0] = cmd, idx[1] = times used
                    .filter(function (v) { return v[0]; }) // remove empty strings
                    .sort(function (a, b) { return a[1] - b[1]; }) // sort from least to greatest
                    .reverse() //sort from greatest to least
                    .map(function (v) { return v[0] + ": " + v[1]; }) //turn back from 2d array into array of strings
                    .join("\n");
                return [2 /*return*/, {
                        content: data
                    }];
            });
        }); }
    },
    grep: {
        run: function (msg, args) { return __awaiter(void 0, void 0, void 0, function () {
            var regex, data, match, finds, _i, match_1, find;
            var _a;
            return __generator(this, function (_b) {
                regex = args[0];
                if (!regex) {
                    return [2 /*return*/, {
                            content: "no search given"
                        }];
                }
                data = args.slice(1).join(" ").trim();
                if (!data) {
                    if ((_a = msg.attachments) === null || _a === void 0 ? void 0 : _a.at(0)) {
                        data = downloadSync(msg.attachments.at(0).attachment).toString();
                    }
                    else
                        return [2 /*return*/, { content: "no data given to search through" }];
                }
                match = data.matchAll(new RegExp(regex, "g"));
                finds = "";
                for (_i = 0, match_1 = match; _i < match_1.length; _i++) {
                    find = match_1[_i];
                    if (find[1]) {
                        finds += "Found " + find.slice(1).join(", ") + " at character " + (find.index + 1) + "\n";
                    }
                    else {
                        finds += "Found " + find[0] + " at character " + (find.index + 1) + "\n";
                    }
                }
                return [2 /*return*/, {
                        content: finds
                    }];
            });
        }); },
        help: {
            "info": "search through text with a search",
            "arguments": {
                search: {
                    description: "a regular expression search",
                    required: true
                },
                data: {
                    description: "either a file, or text to search through",
                    required: true
                }
            }
        }
    },
    alias: {
        run: function (msg, args) { return __awaiter(void 0, void 0, void 0, function () {
            var cmd, realCmd;
            var _a;
            return __generator(this, function (_b) {
                _a = args, cmd = _a[0], args = _a.slice(1);
                realCmd = args[0];
                args = args.slice(1);
                fs.appendFileSync("command-results/alias", msg.author.id + ": " + cmd + " " + realCmd + " " + args.join(" ") + ";END\n");
                createAliases();
                return [2 /*return*/, {
                        content: "Added `" + cmd + "` = `" + realCmd + "` `" + args.join(" ") + "`"
                    }];
            });
        }); }
    },
    "!!": {
        run: function (msg, args) { return __awaiter(void 0, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!lastCommand) {
                            return [2 /*return*/, { content: "You ignorance species, there have not been any commands run." }];
                        }
                        return [4 /*yield*/, doCmd(lastCommand, true)];
                    case 1: return [2 /*return*/, _a.sent()];
                }
            });
        }); }
    },
    snipe: {
        run: function (msg, args) { return __awaiter(void 0, void 0, void 0, function () {
            var _a;
            return __generator(this, function (_b) {
                if (!snipe) {
                    return [2 /*return*/, { content: "You idiot, nothing was ever said ever in the history of this server" }];
                }
                return [2 /*return*/, { content: snipe.author + " says:```\n" + snipe.content + "```", files: (_a = snipe.attachments) === null || _a === void 0 ? void 0 : _a.toJSON(), deleteFiles: false, embeds: snipe.embeds }];
            });
        }); }
    }
};
function createAliases() {
    var a = {};
    var data = fs.readFileSync("command-results/alias", "utf-8");
    for (var _i = 0, _a = data.split(';END'); _i < _a.length; _i++) {
        var cmd = _a[_i];
        if (!cmd.trim())
            continue;
        var _b = cmd.split(":"), _ = _b[0], args = _b[1];
        args = args.trim();
        var _c = args.split(" "), actualCmd = _c[0], rest_1 = _c.slice(1);
        actualCmd = actualCmd.trim();
        a[actualCmd] = rest_1;
    }
    return a;
}
var aliases = createAliases();
var rest = new REST({ version: "9" }).setToken(token);
(function () { return __awaiter(void 0, void 0, void 0, function () {
    var error_1;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                console.log('Started refreshing application (/) commands.');
                return [4 /*yield*/, rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: slashCommands })];
            case 1:
                _a.sent();
                console.log('Successfully reloaded application (/) commands.');
                return [3 /*break*/, 3];
            case 2:
                error_1 = _a.sent();
                console.error(error_1);
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); })();
function doCmd(msg, returnJson) {
    var _a, _b, _c, _d;
    if (returnJson === void 0) { returnJson = false; }
    return __awaiter(this, void 0, void 0, function () {
        var command, args, doFirsts, _e, _f, _i, idx, oldContent, cmd, _g, _h, _j, _k, _l, _m, canRun, exists, rv, _o, _p, file;
        var _q;
        return __generator(this, function (_r) {
            switch (_r.label) {
                case 0: return [4 /*yield*/, parseCmd({ msg: msg })];
                case 1:
                    _q = _r.sent(), command = _q[0], args = _q[1], doFirsts = _q[2];
                    _e = [];
                    for (_f in doFirsts)
                        _e.push(_f);
                    _i = 0;
                    _r.label = 2;
                case 2:
                    if (!(_i < _e.length)) return [3 /*break*/, 5];
                    idx = _e[_i];
                    oldContent = msg.content;
                    cmd = doFirsts[idx];
                    msg.content = cmd;
                    _g = args;
                    _h = idx;
                    _k = (_j = args[idx]).replaceAll;
                    _l = ["%{}"];
                    _m = getContentFromResult;
                    return [4 /*yield*/, doCmd(msg, true)];
                case 3:
                    _g[_h] = _k.apply(_j, _l.concat([_m.apply(void 0, [_r.sent()]).trim()]));
                    msg.content = oldContent;
                    _r.label = 4;
                case 4:
                    _i++;
                    return [3 /*break*/, 2];
                case 5:
                    canRun = true;
                    exists = true;
                    if (!commands[command]) {
                        rv = { content: command + " does not exist" };
                        exists = false;
                    }
                    if (!exists) return [3 /*break*/, 9];
                    if (commands[command].permCheck) {
                        canRun = commands[command].permCheck(msg);
                    }
                    if ((_a = WHITELIST[msg.author.id]) === null || _a === void 0 ? void 0 : _a.includes(command)) {
                        canRun = true;
                    }
                    if ((_b = BLACKLIST[msg.author.id]) === null || _b === void 0 ? void 0 : _b.includes(command)) {
                        canRun = false;
                    }
                    if (!canRun) return [3 /*break*/, 7];
                    return [4 /*yield*/, commands[command].run(msg, args)];
                case 6:
                    rv = _r.sent();
                    addToCmdUse(command);
                    return [3 /*break*/, 8];
                case 7:
                    rv = { content: "You do not have permissions to run this command" };
                    _r.label = 8;
                case 8: return [3 /*break*/, 12];
                case 9:
                    if (!aliases[command]) return [3 /*break*/, 11];
                    msg.content = "" + prefix + aliases[command].join(" ") + " " + args.join(" ");
                    command = aliases[command][0];
                    //finds the original command
                    while ((_c = aliases[command]) === null || _c === void 0 ? void 0 : _c[0]) {
                        command = aliases[command][0];
                    }
                    return [4 /*yield*/, doCmd(msg, true)];
                case 10:
                    rv = _r.sent();
                    return [3 /*break*/, 12];
                case 11:
                    rv = { content: command + " does not exist" };
                    _r.label = 12;
                case 12:
                    if (!illegalLastCmds.includes(command)) {
                        lastCommand = msg;
                    }
                    if (returnJson) {
                        return [2 /*return*/, rv];
                    }
                    if (!Object.keys(rv).length) {
                        return [2 /*return*/];
                    }
                    if (rv.delete) {
                        msg.delete();
                    }
                    if (((_d = rv.content) === null || _d === void 0 ? void 0 : _d.length) >= 2000) {
                        fs.writeFileSync("out", rv.content);
                        delete rv["content"];
                        if (rv.files) {
                            rv.files.push({ attachment: "out", name: "cmd.txt", description: "command output too long" });
                        }
                        else {
                            rv.files = [{
                                    attachment: "out", name: "cmd.txt", description: "command output too long"
                                }];
                        }
                    }
                    if (!rv.content)
                        delete rv['content'];
                    return [4 /*yield*/, msg.channel.send(rv)];
                case 13:
                    _r.sent();
                    if (rv.files) {
                        for (_o = 0, _p = rv.files; _o < _p.length; _o++) {
                            file = _p[_o];
                            if (file.delete !== false && rv.deleteFiles)
                                fs.rmSync(file.attachment);
                        }
                    }
                    return [2 /*return*/];
            }
        });
    });
}
client.on('ready', function () {
    console.log("ONLINE");
});
client.on("messageDelete", function (m) { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        if (m.author.id != client.id)
            snipe = m;
        return [2 /*return*/];
    });
}); });
client.on("messageCreate", function (m) { return __awaiter(void 0, void 0, void 0, function () {
    var content;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                content = m.content;
                if (content == 'u!stop') {
                    m.content = '[stop';
                    content = m.content;
                }
                if (content.slice(0, prefix.length) !== prefix) {
                    return [2 /*return*/];
                }
                return [4 /*yield*/, doCmd(m)];
            case 1:
                _a.sent();
                return [2 /*return*/];
        }
    });
}); });
client.on("interactionCreate", function (interaction) { return __awaiter(void 0, void 0, void 0, function () {
    var user, user, times, i, rv, _i, _a, file, arglist, args, rv, user, member, embed;
    var _b, _c, _d, _e, _f, _g, _h, _j, _k;
    return __generator(this, function (_l) {
        switch (_l.label) {
            case 0:
                if (!interaction.isCommand()) return [3 /*break*/, 18];
                addToCmdUse("/" + interaction.commandName);
                if (!(interaction.commandName == 'attack')) return [3 /*break*/, 3];
                user = interaction.options.get("user")['value'];
                return [4 /*yield*/, interaction.reply("Attacking " + user + "...")];
            case 1:
                _l.sent();
                return [4 /*yield*/, interaction.channel.send(user + " has been attacked by <@" + interaction.user.id + ">")];
            case 2:
                _l.sent();
                return [3 /*break*/, 17];
            case 3:
                if (!(interaction.commandName == 'ping')) return [3 /*break*/, 9];
                user = ((_b = interaction.options.get("user")) === null || _b === void 0 ? void 0 : _b.value) || "<@" + interaction.user.id + ">";
                times = ((_c = interaction.options.get("evilness")) === null || _c === void 0 ? void 0 : _c.value) || 1;
                interaction.reply("Pinging...");
                SPAM_ALLOWED = true;
                i = 0;
                _l.label = 4;
            case 4:
                if (!(i < times)) return [3 /*break*/, 8];
                if (!SPAM_ALLOWED)
                    return [3 /*break*/, 8];
                return [4 /*yield*/, interaction.channel.send("<@" + user + "> has been pinged")];
            case 5:
                _l.sent();
                return [4 /*yield*/, new Promise(function (res) { return setTimeout(res, Math.random() * 700 + 200); })];
            case 6:
                _l.sent();
                _l.label = 7;
            case 7:
                i++;
                return [3 /*break*/, 4];
            case 8: return [3 /*break*/, 17];
            case 9:
                if (!(interaction.commandName == 'img')) return [3 /*break*/, 12];
                return [4 /*yield*/, commands["img"].run(interaction, [(_d = interaction.options.get("width")) === null || _d === void 0 ? void 0 : _d.value, (_e = interaction.options.get("height")) === null || _e === void 0 ? void 0 : _e.value, (_f = interaction.options.get("color")) === null || _f === void 0 ? void 0 : _f.value])];
            case 10:
                rv = _l.sent();
                return [4 /*yield*/, interaction.reply(rv)];
            case 11:
                _l.sent();
                if (rv.files) {
                    for (_i = 0, _a = rv.files; _i < _a.length; _i++) {
                        file = _a[_i];
                        fs.rmSync(file.attachment);
                    }
                }
                return [3 /*break*/, 17];
            case 12:
                if (!(interaction.commandName == 'help')) return [3 /*break*/, 14];
                return [4 /*yield*/, interaction.reply({
                        content: "use `[help -n -plain`, slash commands r boring, so i will not support them that much\nbegrudgingly, here is the current help file",
                        files: [{
                                attachment: './help.html',
                                name: "heres some help.html",
                                description: "lmao"
                            }]
                    })];
            case 13:
                _l.sent();
                return [3 /*break*/, 17];
            case 14:
                if (!(interaction.commandName == "ccmd")) return [3 /*break*/, 17];
                interaction.author = interaction.member.user;
                arglist = [(_g = interaction.options.get("name")) === null || _g === void 0 ? void 0 : _g.value, (_h = interaction.options.get("command")) === null || _h === void 0 ? void 0 : _h.value];
                args = (_j = interaction.options.get("args")) === null || _j === void 0 ? void 0 : _j.value;
                if (args) {
                    arglist = arglist.concat(args.split(" "));
                }
                return [4 /*yield*/, commands['alias'].run(interaction, arglist)];
            case 15:
                rv = _l.sent();
                return [4 /*yield*/, interaction.reply(rv)];
            case 16:
                _l.sent();
                _l.label = 17;
            case 17: return [3 /*break*/, 19];
            case 18:
                if (interaction.isUserContextMenu()) {
                    addToCmdUse("/" + interaction.commandName);
                    if (interaction.commandName == 'ping') {
                        interaction.reply("<@" + interaction.user.id + "> has pinged <@" + interaction.targetUser.id + "> by right clicking them");
                    }
                    else if (interaction.commandName == 'info') {
                        user = interaction.targetUser;
                        member = interaction.targetMember;
                        embed = new MessageEmbed();
                        embed.setColor(interaction.targetMember.displayColor);
                        embed.setThumbnail(user.avatarURL());
                        embed.addField("Id", user.id || "#!N/A", true);
                        embed.addField("Username", user.username || "#!N/A", true);
                        embed.addField("Nickname", member.nickName || "#!N/A", true);
                        embed.addField("0xColor", member.displayHexColor.toString() || "#!N/A", true);
                        embed.addField("Color", member.displayColor.toString() || "#!N/A", true);
                        embed.addField("Created at", user.createdAt.toString() || "#!N/A", true);
                        embed.addField("Joined at", member.joinedAt.toString() || "#!N/A", true);
                        embed.addField("Boosting since", ((_k = member.premiumSince) === null || _k === void 0 ? void 0 : _k.toString()) || "#!N/A", true);
                        interaction.reply({ embeds: [embed] });
                    }
                }
                _l.label = 19;
            case 19: return [2 /*return*/];
        }
    });
}); });
function generateCmdUseFile() {
    var data = "";
    for (var cmd in CMDUSE) {
        data += cmd + ":" + CMDUSE[cmd] + "\n";
    }
    return data;
}
function addToCmdUse(cmd) {
    if (CMDUSE[cmd]) {
        CMDUSE[cmd] += 1;
    }
    else {
        CMDUSE[cmd] = 1;
    }
    fs.writeFileSync("cmduse", generateCmdUseFile());
}
function loadCmdUse() {
    var cmduse = {};
    if (!fs.existsSync("cmduse")) {
        return {};
    }
    var data = fs.readFileSync("cmduse", "utf-8");
    for (var _i = 0, _a = data.split("\n"); _i < _a.length; _i++) {
        var line = _a[_i];
        if (!line)
            continue;
        var _b = line.split(":"), cmd = _b[0], times = _b[1];
        cmduse[cmd] = parseInt(times);
    }
    return cmduse;
}
var CMDUSE = loadCmdUse();
client.login(token);
