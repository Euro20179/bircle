import fs from 'fs'
import vm from 'vm'
import https from 'https'
import * as cheerio from "cheerio"

import { Stream } from 'stream'

import globals from '../globals'
import useTracker from '../use-tracker'
import economy from '../economy'
import pet from '../pets'
import timer from '../timer'

import htmlRenderer from '../html-renderer'

import { Collection, ColorResolvable, Guild, GuildEmoji, GuildMember, Message, EmbedBuilder, Role, TextChannel, User, ButtonStyle } from 'discord.js'
import common_to_commands, { StatusCode, lastCommand, CommandCategory, commands, createCommandV2, createHelpOption, createHelpArgument, getCommands, generateDefaultRecurseBans, getAliasesV2, getMatchCommands, AliasV2, aliasesV2, ccmdV2, crv, promptUser, cho, PagedEmbed, crvFile } from '../common_to_commands'
import { choice, cmdCatToStr, fetchChannel, fetchUser, generateFileName, generateTextFromCommandHelp, getContentFromResult, mulStr, Pipe, safeEval, BADVALUE, efd, generateCommandSummary, fetchUserFromClient, ArgList, MimeType, generateHTMLFromCommandHelp, mimeTypeToFileExtension, generateDocSummary, isMsgChannel, fetchUserFromClientOrGuild, cmdFileName, sleep, truthy, romanToBase10, titleStr, getToolIp, prettyJSON, getImgFromMsgAndOptsAndReply, base10ToRoman, rotN, formatMember, searchMsg, binStrToDec, fracBinStrToDec, isSafeFilePath, isBetween } from '../util'
import iterators from '../iterators'

import { format, getOpts, parseBracketPair } from '../parsing'

import vars from '../vars'
import common from '../common'
import { spawn, spawnSync } from 'child_process'
import { isNaN, shuffle } from 'lodash'
import units from '../units'
import amountParser from '../amount-parser'

import translate from '@iamtraction/google-translate'
import { attach } from 'neovim'

import cmds from '../command-parser/cmds'
import configManager, { getConfigValue } from '../config-manager'
import stackl2 from '../stackl2'

const nodemailer = require("nodemailer")

const handleSending = cmds.handleSending

const langs = {
    auto: 'Automatic',
    af: 'Afrikaans',
    sq: 'Albanian',
    ar: 'Arabic',
    hy: 'Armenian',
    az: 'Azerbaijani',
    eu: 'Basque',
    be: 'Belarusian',
    bn: 'Bengali',
    bs: 'Bosnian',
    bg: 'Bulgarian',
    ca: 'Catalan',
    ceb: 'Cebuano',
    ny: 'Chichewa',
    'zh-cn': 'Chinese Simplified',
    'zh-tw': 'Chinese Traditional',
    co: 'Corsican',
    hr: 'Croatian',
    cs: 'Czech',
    da: 'Danish',
    nl: 'Dutch',
    en: 'English',
    eo: 'Esperanto',
    et: 'Estonian',
    tl: 'Filipino',
    fi: 'Finnish',
    fr: 'French',
    fy: 'Frisian',
    gl: 'Galician',
    ka: 'Georgian',
    de: 'German',
    el: 'Greek',
    gu: 'Gujarati',
    ht: 'Haitian Creole',
    ha: 'Hausa',
    haw: 'Hawaiian',
    iw: 'Hebrew',
    hi: 'Hindi',
    hmn: 'Hmong',
    hu: 'Hungarian',
    is: 'Icelandic',
    ig: 'Igbo',
    id: 'Indonesian',
    ga: 'Irish',
    it: 'Italian',
    ja: 'Japanese',
    jw: 'Javanese',
    kn: 'Kannada',
    kk: 'Kazakh',
    km: 'Khmer',
    ko: 'Korean',
    ku: 'Kurdish (Kurmanji)',
    ky: 'Kyrgyz',
    lo: 'Lao',
    la: 'Latin',
    lv: 'Latvian',
    lt: 'Lithuanian',
    lb: 'Luxembourgish',
    mk: 'Macedonian',
    mg: 'Malagasy',
    ms: 'Malay',
    ml: 'Malayalam',
    mt: 'Maltese',
    mi: 'Maori',
    mr: 'Marathi',
    mn: 'Mongolian',
    my: 'Myanmar (Burmese)',
    ne: 'Nepali',
    no: 'Norwegian',
    ps: 'Pashto',
    fa: 'Persian',
    pl: 'Polish',
    pt: 'Portuguese',
    ma: 'Punjabi',
    ro: 'Romanian',
    ru: 'Russian',
    sm: 'Samoan',
    gd: 'Scots Gaelic',
    sr: 'Serbian',
    st: 'Sesotho',
    sn: 'Shona',
    sd: 'Sindhi',
    si: 'Sinhala',
    sk: 'Slovak',
    sl: 'Slovenian',
    so: 'Somali',
    es: 'Spanish',
    su: 'Sudanese',
    sw: 'Swahili',
    sv: 'Swedish',
    tg: 'Tajik',
    ta: 'Tamil',
    te: 'Telugu',
    th: 'Thai',
    tr: 'Turkish',
    uk: 'Ukrainian',
    ur: 'Urdu',
    uz: 'Uzbek',
    vi: 'Vietnamese',
    cy: 'Welsh',
    xh: 'Xhosa',
    yi: 'Yiddish',
    yo: 'Yoruba',
    zu: 'Zulu'
}

const langCodes = Object.fromEntries(Object.entries(langs).map(v => [v[0], v[1]] = [v[1].toLowerCase(), v[0]]))


export default function*(CAT: CommandCategory): Generator<[string, CommandV2]> {

    yield [
        "email-euro", ccmdV2(async function({ args, opts }) {
            const transport = nodemailer.createTransport({
                host: "10.0.0.2",
                port: 25,
                secure: false,
                tls: {
                    rejectUnauthorized: false
                }
            })

            const info = await transport.sendMail({
                from: opts.getString("f", opts.getString("from", '"Discord bot" <bircle@raspberrypi>')),
                to: '"Euro" <user@raspberrypi>',
                subject: opts.getString('s', opts.getString('subject', "")),
                html: args.join(" ")
            })

            if (info.accepted) {
                return crv(`Email sent to: ${info.accepted[0]}`)
            } else {
                return crv("Failed to send email")
            }
        }, "emails euro")
    ],

        yield [
            "doesnothing", ccmdV2(async function({ msg }) {
                if (!msg.guild) {
                    return crv("Not in a guild", { status: StatusCode.ERR })
                }
                let text = ""
                for (let user of await msg.guild?.members.fetch()) {
                    text += `${user[1].displayName}\n`
                    const rolesJson = user[1].roles.cache.toJSON()
                    for (let i = 0; i < rolesJson.length; i++) {
                        text += `${rolesJson[i].name}\n`
                    }
                    text += "\n\n"
                }
                return crv(text)
            }, "does nothing in particular")
        ]

    yield [
        "wiktionary", ccmdV2(async function({ args, msg, opts }) {
            const word = args.join(" ")
            const resp = await fetch(`https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURI(word)}`)
            const j = await resp.json()
            if (opts.getBool("r", false)) {
                return crv(JSON.stringify(j))
            }
            const partsOfSpeech: any[] = j["en"]
            if (!partsOfSpeech) {
                return crv("No definitions", { status: StatusCode.CMDSTATUS, statusNr: 101 })
            }
            const embeds = []
            for (const [i, speach] of iterators.enumerate(partsOfSpeech)) {
                const e = new EmbedBuilder()
                e.setTitle(speach.partOfSpeech)
                let desc = ""
                for (const [count, def] of iterators.enumerate(partsOfSpeech[i].definitions as any[])) {
                    desc += `${count + 1}.\n`
                    desc += htmlRenderer.renderHTML(def.definition, 0, "https://en.wiktionary.org")
                    desc += "\n\n"
                }
                e.setDescription(desc)
                embeds.push(e)
            }
            let paged = new PagedEmbed(msg, embeds, "wiktionary")
            await paged.begin()
            return { noSend: true, status: StatusCode.RETURN }
        }, "Lookup a word in wiktionary", {
            helpOptions: {
                r: createHelpOption("gets the raw json")
            }
        })
    ]

    yield [
        "seq", ccmdV2(async function({ args, opts }) {
            let [seqArg, max, ..._] = args
            const seq = seqArg.split(",").map(Number)
            max = Number(max)
            const sep = opts.getString("s", " ")
            const items = iterators.sequence(...seq, max)
            if (!items) {
                return crv("Invalid sequence", { status: StatusCode.ERR })
            }
            return crv(items.take(1000).reduce("", (res, c) => {
                return res ? res + sep + String(c) : String(c)
            }))
        }, "Fills in an arethmetic or geometric series", {
            helpArguments: {
                initialSequence: createHelpArgument("A , seperated sequence of numbers"),
                max: createHelpArgument("The end of the range")
            },
            helpOptions: {
                s: createHelpOption("Output seperator between numbers")
            },
            gen_opts: true
        })
    ]

    yield [
        "media", ccmdV2(async function({ msg, args, sendCallback }) {
            const aioServer = getConfigValue("general.AIO-server")
            const aioAuth = getConfigValue("secrets.AIO-auth")
            if (!aioServer) {
                return crv("Could not get results", { status: StatusCode.ERR })
            }

            args.beginIter()
            let provider = args.expectOneOf(1, ["imdb", "omdb", "movie", "show", "game", "steam", "anilist", "anime", "googlebooks", "openbooks", "book"])
            if (provider === BADVALUE) {
                return crv("Invalid provider")
            }
            const search = args.expectString(truthy)
            if (search === BADVALUE) {
                return crv("no search")
            }

            const translateProvider = {
                imdb: "omdb",
                movie: "omdb",
                show: "omdb",
                anime: "anilist",
                game: "steam",
                book: "googlebooks"
            }
            provider = translateProvider[provider as keyof typeof translateProvider] || provider

            const title = encodeURIComponent(args.join(" "))
            if (!title) {
                return crv("No search", { status: StatusCode.ERR })
            }

            const res = await fetch(aioServer + `/api/v1/metadata/identify?title=${encodeURIComponent(search)}&provider=${provider}`, {
                headers: {
                    "Authorization": `Basic ${aioAuth}`
                }
            })
            const text = await res.text()
            if (res.status !== 200) {
                return crv(text,
                    { status: StatusCode.ERR }
                )
            }
            const items = new Map<string, string>()
            const [_, jsonL] = text.split("\x02")
            for (let line of jsonL.trim().split("\n")) {
                if (!line) continue
                const j = JSON.parse(line)
                items.set(j.Title || j.Native_Title, j.ProviderID)
            }
            const values = Object.fromEntries(Array.from(items.keys()).map((v, i) => [i + 1, v]))
            const choice = await promptUser(msg, `Please select one\n${Object.entries(values).map(v => `${v[0]}: ${v[1]}`).join("\n")}`, sendCallback, { timeout: 20000 })
            if (!choice) {
                return crv("No choice", { status: StatusCode.ERR })
            }
            if (isNaN(Number(choice.content)) || !isBetween(0, Number(choice.content), items.size + 1)) {
                return crv("Invalid choice", { status: StatusCode.ERR })
            }

            const name = values[choice.content]

            const id = items.get(name)?.trim()
            if (!id) {
                return crv("Could not find item id", { status: StatusCode.ERR })
            }

            const itemRes = await fetch(aioServer + `/api/v1/metadata/finalize-identify?identified-id=${encodeURIComponent(id)}&provider=${provider}`, {
                headers: {
                    "Authorization": `Basic ${aioAuth}`
                }
            })

            const data = await itemRes.json()

            const ratingPercent = data.Rating / data.RatingMax

            let tier = ""
            const tiers = [
                [.90, "S"],
                [.80, "A"],
                [.70, "B"],
                [.60, "C"],
                [.50, "D"],
                [0, "F"]
            ] as const
            for (let tierRange of tiers) {
                if (ratingPercent >= tierRange[0]) {
                    tier = tierRange[1]
                    break
                }
            }

            const genres = JSON.parse(data.Genres) || []
            const embed = new EmbedBuilder()
                .setDescription(htmlRenderer.renderHTML(data.Description))
                .setTitle(`${data.Title || data.Native_Title} - ${data.ReleaseYear || 'unknown release year'} (${data.Rating} / ${data.RatingMax} - ${tier})`)
                .setFooter({ text: `${genres.join(", ") || "No genres"} - ID: ${data.ProviderID}` })

            if (data.Thumbnail && data.Thumbnail != "N/A") {
                embed.setThumbnail(data.Thumbnail)
            }

            return {
                content: Object.entries(JSON.parse(data.MediaDependant)).map(v => `${v[0].split("-").slice(1).join(" ")}: ${v[1]}`).join("\n"),
                embeds: [embed],
                status: StatusCode.RETURN
            }

        }, "search media", {
            helpArguments: {
                provider: createHelpArgument("The provider to use"),
                search: createHelpArgument("The search query")
            }
        })
    ]

    yield [
        "f32", ccmdV2(async function({ args }) {
            const f = args[0]
            const signS = f[0]
            const expS = f.slice(1, 9)
            const mantS = "1" + f.slice(9) as string
            let decimalLocation = 1n

            const sign = signS === "1" ? "-" : ""

            const exp = binStrToDec(expS) - 127n

            decimalLocation += exp

            let intPart, fracPart
            if (decimalLocation > 24) {
                intPart = mantS + "0".repeat(Number(decimalLocation) - 24)
                fracPart = "0"
            } else if (decimalLocation > 0) {
                intPart = mantS.slice(0, Number(decimalLocation))
                fracPart = mantS.slice(Number(decimalLocation))
            } else {
                intPart = "0"
                fracPart = "0".repeat(Number(-decimalLocation)) + mantS
            }

            const ans = Number(binStrToDec(intPart)) + fracBinStrToDec(fracPart)


            return crv(`${sign}${ans}`)

        }, "Float32 calculator")
    ]

    yield [
        "vim", ccmdV2(async function({ args }) {
            const nvim_proc = spawn("nvim", ["-u", "NONE", "-N", "--embed"], {})
            const nvim = attach({ proc: nvim_proc })
            try {
                await nvim.command(`redir => var | sandbox ${args.join(" ")} | redir END`)
            }
            catch (err) {
                return { content: `${err}`, status: StatusCode.ERR }
            }
            let res = await nvim.getVar("var")
            try {
                nvim_proc.kill()
            }
            catch (err) {
                console.error("Could not kill nvim")
            }
            return crv(res.toString())
        }, "vim")
    ]

    yield [
        "roman-numerals", ccmdV2(async function({ args, opts }) {
            if (opts.getBool("r", false)) {
                return crv(args.map(n => base10ToRoman(Number(n))).join(opts.getString("join", "\n")))
            }
            return crv(args.map(roman => romanToBase10(roman.toUpperCase())).join(opts.getString("join", "\n")))
        }, "Convert roman numberals to aribic numerals", {
            docs: "5000 = B or V-<br>10000 = K OR X-<br>50000 = R OR L-<br>100000 = G OR C-<br>500000 = T D-<br>1000000 = F OR M-",
            helpOptions: {
                "r": createHelpOption("The roman numerals to convert ot aribic numerals"),
                "join": createHelpOption("The text to join each result by", undefined, "\n", true)
            },
            helpArguments: {
                '...roman numerals': createHelpArgument("The numerals to convert to aribic numerals")
            },
            gen_opts: true
        })
    ]

    yield [
        'translate', ccmdV2(async function({ msg, args, opts, stdin }) {
            if (opts.getBool("l", false)) {
                return crv(htmlRenderer.renderHTML(`List of languages<br>${Object.entries(langs).map(v => `${v[0]}: ${v[1]}`).join("<br>")}`))
            }

            let to = opts.getString("to", "en").toLowerCase(), text, from = opts.getString("from", "auto")

            if (args.length) {
                args.beginIter()
                let translateTo = args.expect(1, ([string]) => langs[string as keyof typeof langs] || langCodes[string] ? string : BADVALUE);
                if (translateTo !== BADVALUE) {
                    to = translateTo.toLowerCase()
                }
                else {
                    args.back()
                }
                text = args.expectString(truthy)
            }
            if (msg.reference) {
                text = (await msg.fetchReference()).content
            }
            if (stdin) {
                text = getContentFromResult(stdin)
            }
            if (!text || text === BADVALUE) {
                let m = opts.getNumber("m", 1) + 1
                let req_msg = (await msg.channel.messages.fetch({ limit: m })).at(m - 1) //-m + 1 because 1 is the message the user just sent to chat
                if (!req_msg) {
                    return crv("Could not get message", { status: StatusCode.ERR })
                }
                text = req_msg.content
            }

            if (langCodes[to]) to = langCodes[to]

            let res = await translate(text, {
                to,
                from
            })
            return crv(res.text)
        }, "translate from language a to b", {
            docs: "Use <code>translate -l</code> to list valid languages",
            accepts_stdin: "The text to translate",
            helpArguments: {
                from: createHelpArgument("The language to translate from, put a for auto", false),
                to: createHelpArgument("The language to translate to", false, "from"),
                text: createHelpArgument("The text to translate")
            },
            helpOptions: {
                to: createHelpOption("The language to translate to", undefined, "en", true),
                from: createHelpOption("The language to translate from", undefined, "auto", true),
                m: createHelpOption("Translate the message <b>m</b> messages up", undefined, undefined, true),
                l: createHelpOption("List valid languages")
            },
            gen_opts: true
        })
    ]

    yield ["imdb2", ccmdV2(async function({ msg, args, opts, stdin }) {
        const url = configManager.BOT_CONFIG["general"]["overseerr-url"] + "/api/v1/search"
        console.log(url)
        const query = stdin ? getContentFromResult(stdin) : args.join(" ")
        const finalUrl = url + `?query=${encodeURIComponent(query)}`
        const res = await fetch(finalUrl, {
            headers: {
                [`X-Api-Key`]: configManager.BOT_CONFIG["secrets"]["overseerr-token"]
            }
        })
        const data = await res.json()
        const embeds: EmbedBuilder[] = []
        const results = data.results.sort((a, b) => b.popularity - a.popularity)
        const paged = new PagedEmbed(msg, embeds, "imdb2")

        let pageNo = 0
        for (let item of results) {
            const e = new EmbedBuilder()
            let title = ""
            if (item.name) {
                title = `${item.name}`
                if (item.originalName) {
                    title += ` (${item.originalName})`
                }
            } else {
                title = `${item.title} (${item.originalTitle})`
            }

            e.setTitle(title)
            e.setDescription(item.overview || "N/A")
            if (item.posterPath) {
                e.setImage(`https://image.tmdb.org/t/p/w300_and_h450_face${item.posterPath}`)
            }
            e.setFields([
                {
                    name: "Aired",
                    value: item.firstAirDate || item.releaseDate || "N/A",
                    inline: true
                },
                {
                    name: "Rating",
                    value: String(item.voteAverage),
                    inline: true

                },
            ])

            paged.addButton(`id.${item.id}`, { label: "ℹ️", style: ButtonStyle.Primary, customId: `imdb2.id.${item.id}:${msg.author.id}` }, async function(int) {
                const id = int.customId.split(":")[0].split(".")[2]
                let final
                for (let item of results) {
                    if (String(item.id) == id) {
                        final = item
                        break
                    }
                }
                if (!final) return

                const type = item.mediaType
                const url = configManager.BOT_CONFIG["general"]["overseerr-url"] + "/api/v1/"
                if (type == 'movie') {
                    let finalUrl = `${url}${type}/${id}`
                    const res = await fetch(finalUrl, {
                        headers: {
                            [`X-Api-Key`]: configManager.BOT_CONFIG["secrets"]["overseerr-token"]
                        }
                    })
                    const data = await res.json()
                    fs.writeFileSync("./data.json", JSON.stringify(data))
                    console.log(data)
                    let embed = new EmbedBuilder()
                    this.embeds = [embed]
                    embed.setFields([
                        {
                            name: "revenue",
                            value: String(data.revenue),
                            inline: true
                        },
                        {
                            name: "release date",
                            value: data.releaseDate,
                            inline: true
                        }
                    ])
                    embed.setURL(data.homepage)
                    embed.setTitle(final.title)
                    let genres = data.genres.map(i => i.name).join(", ")
                    embed.setFooter({ text: genres })
                }
            }, pageNo++)

            embeds.push(e)
        }
        await paged.begin()
        return { noSend: true, status: StatusCode.RETURN }
    }, "Searches for a movie/show")]

    yield ['imdb', ccmdV2(async function({ msg, args, opts, stdin, sendCallback }) {
        const search = `https://www.imdb.com/find/?q=${stdin ? getContentFromResult(stdin) : args.join(" ")}`
        let results = await fetch(search, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36"
            }
        })

        let html = await results.text()

        let as = html.matchAll(/\/title\/([^"]+)[^>]+>([^<]+)/g)
        let links: { [key: string]: string } = {}
        for (let match of as) {
            links[`https://www.imdb.com/title/${match[1]}`] = match[2].replaceAll(/&#x([^;]+);/g, (_, num) => String.fromCodePoint(parseInt(num, 16)))
        }
        let linkList = Object.keys(links)
        let link
        if (!opts.getBool("a", false)) {
            let text = ""
            for (let [i, link] of iterators.enumerate(linkList)) {
                text += `${i + 1}: ${links[link]}\n`
            }
            let ans: { content: string } | false =
                !opts.getBool("a", false)
                    ? await promptUser(msg, `Pick one\n${text}`, sendCallback, {
                        filter: m => !isNaN(Number(m.content)) && m.author.id === msg.author.id
                    })
                    : { content: "1" }

            if (!ans) {
                return crv("Did not respond", { status: StatusCode.ERR })
            }

            link = linkList[Number(ans.content) - 1]
        }
        else {
            link = linkList[0]
        }

        let showReq = await fetch(link, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36"
            }
        })

        let showHTML = await showReq.text()

        let returnText = false
        let rawTextToReturn = ""
        let workingJson: any;

        if (opts.getBool("above-the-fold-data", false)) {
            returnText = true
            let j = showHTML.match(/<script id="__NEXT_DATA__" type="application\/json">(.*)<\/script><script>if\(typeof uet/)
            if (!j?.[1]) {
                return crv("Could not get above the fold data", { status: StatusCode.ERR })
            }
            workingJson = JSON.parse(j![1])
            rawTextToReturn = j[1]
        }
        else {
            let j = showHTML.match(/<script type="application\/ld\+json">(.*)<\/script>/)

            if (!j) {
                return crv("Could not find data", { status: StatusCode.ERR })
            }
            workingJson = JSON.parse(j[1].split("</script>")[0])
        }
        if (opts.getString("fmt", false)) {
            returnText = true
            let str = opts.getString("fmt", "").replaceAll(/\{([\.\w_\d]+)\}/g, (_, find) => {
                let obj = workingJson
                for (let dot of find.split(".")) {
                    obj = obj?.[dot]
                }
                return obj.toString()
            })
            rawTextToReturn = str
        }

        if (returnText) {
            return crv(rawTextToReturn)
        }

        if (opts.getBool("json", false)) {
            return crv(JSON.stringify(workingJson))
        }

        let runtime = workingJson.duration

        let [h, m] = runtime?.split("H") || []
        h ||= "0"
        m ||= "0"
        h = h.replace("PT", "")

        let e = new EmbedBuilder()
            .setTitle(workingJson.name)
            .setDescription(workingJson.description.replaceAll(/&#x([^;]+);/g, (_: string, num: string) => String.fromCodePoint(parseInt(num, 16))))
            .setURL(workingJson.url)
            .setFields({ name: "Review Score", value: `${workingJson.aggregateRating.ratingValue} (${workingJson.aggregateRating.ratingCount})`, inline: true }, { name: "Rated", value: workingJson.contentRating || "Unrated", inline: true }, { name: "Runtime", value: `${h}:${m.replace("M", "")}:00`, inline: true }, { name: "Genre", value: workingJson.genre.join(", "), inline: true })

        e.setThumbnail(workingJson.image)

        return {
            embeds: [e],
            status: StatusCode.RETURN
        }
    }, "Scrapes imdb", {
        accepts_stdin: "Will be used as the search",
        helpArguments: {
            search: createHelpArgument("The movie to search for")
        },
        helpOptions: {
            json: createHelpOption("Return the json result raw"),
            fmt: createHelpOption("a format specifier where you can access json properties in {}", undefined, undefined, true),
            a: createHelpOption("Automatically select the first search result"),
            "above-the-fold-data": createHelpOption("Get data from above the fold :smirk:")
        },
        gen_opts: true
    })]

    yield [
        'al', ccmdV2(async function({ args, opts }) {
            const search = args.join(" ")
            const url = 'https://graphql.anilist.co'
            const qlQuery = `{
                Media(search: "${search}", type: ${opts.getBool("m", false) ? "MANGA" : "ANIME"}){
                    id, type, episodes, description,
                    chapters,
                    meanScore,
                    favourites,
                    popularity,
                    duration,
                    episodes,
                    volumes,
                    startDate {
                        year
                        month
                        day
                    },
                    endDate {
                        year
                        month
                        day
                    },
                    coverImage {
                        large
                        color
                    },
                    title {
                        romaji
                        english
                        native
                    }
                }
            }`

            const embed = new EmbedBuilder()

            const res = await fetch(url, {
                headers: {
                    "Content-Type": "application/json"
                },
                method: "post",
                body: JSON.stringify({
                    query: qlQuery,
                    variables: null,
                    operationName: null
                })
            })

            const json = await res.json()
            if (!json.data?.Media) {
                return crv("No results")
            }

            if (json.data.Media.type === "ANIME") {

                embed.addFields({ name: "#Episodes", value: `${json.data.Media.episodes} (${json.data.Media.duration} min/ep)`, inline: true })
            }

            else if (json.data.Media.type === "MANGA") {
                embed.addFields({ name: "#Chapters", value: `${json.data.Media.chapters} chapters over ${json.data.Media.volumes} vols`, inline: true })
            }
            let { year: yS, month: mS, day: dS } = json.data.Media.startDate
            let { year: yE, month: mE, day: dE } = json.data.Media.endDate

            embed.addFields({ name: "Rating", value: `${json.data.Media.meanScore} / 100`, inline: true })

            if (yE) {
                embed.addFields({ name: `Favorites / Popularity`, value: `${json.data.Media.favourites} / ${json.data.Media.popularity}`, inline: true })
            }

            embed.setURL(`https://anilist.co/${json.data.Media.type}/${json.data.Media.id}`)
            embed.setTitle(`${json.data.Media.title.english} (${json.data.Media.title.romaji} / ${json.data.Media.title.native})`)
            let rawHTML = htmlRenderer.renderHTML(json.data.Media.description).replaceAll("\n\n", "\n")
            let [html, note] = rawHTML.split("**Note:**")
            embed.setDescription(html || "No desecription")
            embed.setFooter({ text: `**Note:** ${note}\n\nStart/End date: ${mS}/${dS}/${yS} - ${mE}/${dE}/${yE}\n\nId: ${json.data.Media.id}\n\nType: ${titleStr(json.data.Media.type.toLowerCase())}` })
            embed.setImage(json.data.Media.coverImage.large)
            embed.setColor(json.data.Media.coverImage.color)

            return { embeds: [embed], status: StatusCode.RETURN }
        }, "Scrapes anilist.co (similar to mal)", {
            helpOptions: {
                m: createHelpOption("Search for the manga instead of anime")
            }
        })
    ]

    yield ['shuf', ccmdV2(async function({ args, stdin }) {
        let text = stdin ? getContentFromResult(stdin).split("\n") : args.resplit("\n")
        return crv(shuffle(text).join("\n"))
    }, "shuffles text by line", {
        accepts_stdin: "The text to shuffle",
        helpArguments: {
            "text": createHelpArgument("The text to shuffle", false)
        }
    })]

    yield ['uniq', ccmdV2(async function({ args, stdin }) {
        let text = stdin ? getContentFromResult(stdin).split("\n") : args.resplit("\n")
        let finalLines: string[] = []
        for (let line of text) {
            if (finalLines.includes(line)) continue
            finalLines.push(line)
        }
        return crv(finalLines.join("\n"))
    }, "Remove duplicate lines")]

    yield ["sort", ccmdV2(async function({ args, stdin, opts }) {
        let text = stdin ? getContentFromResult(stdin).split("\n") : args.resplit("\n")
        let sortFn = undefined
        if (opts.getBool("n", false)) {
            sortFn = (a: string, b: string) => parseFloat(a) - parseFloat(b)
        }
        let sorted = text.sort(sortFn)
        if (opts.getBool("r", false)) {
            sorted = sorted.reverse()
        }
        return crv(sorted.join("\n"))
    }, "Sorts text by line alphabetically", {
        accepts_stdin: "The text to sort",
        helpArguments: {
            text: createHelpArgument("The text to sort", false)
        },
        helpOptions: {
            n: createHelpOption("Sort numerically"),
            r: createHelpOption("Reverse sort")
        },
        gen_opts: true
    })]

    yield ['school-stats', ccmdV2(async function({ msg, opts }) {
        let ip = getToolIp()

        if (!ip) {
            return crv("Euro has not added the special file", {
                status: StatusCode.ERR
            })
        }

        let toFetch = opts.getString("of", msg.author.id)
        let user: User | undefined = msg.author;
        if (toFetch !== msg.author.id) {
            user = (await fetchUserFromClientOrGuild(toFetch, msg.guild)) || msg.author
        }

        let res;
        try {
            res = await fetch(`http://${ip}`, { method: "POST", body: JSON.stringify({ "id": user.id }), headers: { "Content-Type": "application/json" } })
        }
        catch (err) {
            return crv("Could not fetch data", { status: StatusCode.ERR })
        }
        let data
        try {
            data = await res.json()
        }
        catch (err) {
            return crv("Could not get json", { status: StatusCode.ERR })
        }
        let embed = new EmbedBuilder()
            .setTitle(`School stats of ${user.username}`)
            .setColor(msg.member?.displayColor || "NotQuiteBlack")
            .addFields(efd(["smarts", String(data.smarts)], ["charm", String(data.charm)], ["guts", String(data.guts)], ["money", String(data.money)], ["job", String(data.job?.name ?? "None")], ["grade", String(data.grade)]))
        return { embeds: [embed], status: StatusCode.RETURN }
    }, "School stats", {
        helpOptions: {
            of: createHelpOption("The user to get stats of", undefined, "{user}", true)
        },
        gen_opts: true
    })]

    yield ["cat", ccmdV2(async ({ msg, stdin, opts, args }) => {
        let content = "";
        if (stdin) {
            content += getContentFromResult(stdin, "\n")
        }
        else if (msg.reference) {
            let ref = await msg.fetchReference()
            if (ref.attachments) {
                for (let attachment of ref.attachments) {
                    let res = Buffer.from(await (await fetch(attachment[1].url)).arrayBuffer())
                    content += res.toString("binary")
                }
            }
        }
        else {
            let folder = opts.getBool("g", false) ? "garbage-files" : "command-results"
            for (let arg of args) {
                if (!isSafeFilePath(arg)) continue
                if (fs.existsSync(`./${folder}/${arg}`)) {
                    content += fs.readFileSync(`./${folder}/${arg}`, "utf-8")
                }
            }
        }
        if (!content) {
            return { content: "No content", status: StatusCode.ERR }
        }
        if (opts.getBool("r", false) || opts.getDefault("reverse", false) || opts.getDefault("tac", false)) {
            content = content.split("\n").reverse().join("\n")
        }
        return { content: content, status: StatusCode.RETURN }
    }, "Concatinate files from pipe, and from file names", {
        helpArguments: {
            files: createHelpArgument("Files listed in <code>command-file -l</code> to act on<br>will also read files from a replied message", false)
        },
        helpOptions: {
            r: createHelpOption("Reverse order of the lines"),
            g: createHelpOption("Open a file from garbage-files folder instead of command-results")
        },
        accepts_stdin: "Instead of files, act on the text from pipe",
        gen_opts: true
    })]

    yield ["rev", ccmdV2(async ({ stdin, args, opts }) => {
        let content = "";
        if (stdin) {
            content += getContentFromResult(stdin, "\n").split("").reverse().join("")
        }
        for (let arg of args) {
            if (fs.existsSync(`./command-results/${arg}`)) {
                content += fs.readFileSync(`./command-results/${arg}`, "utf-8").split("").reverse().join("")
            }
        }
        if (!content) {
            return { content: "No content", status: StatusCode.ERR }
        }
        if (opts.getBool("r", false) || opts.getDefault("reverse", false) || opts.getDefault("tac", false)) {
            content = content.split("\n").reverse().join("\n")
        }
        return { content: content, status: StatusCode.RETURN }
    }, "Take input from pipe and reverse it", {
        helpArguments: {
            files: createHelpOption("Files listed in <code>command-file -l</code> to act on")
        },
        helpOptions: {
            r: createHelpOption("reverse the order of the lines")
        },
        accepts_stdin: "Instead of files, reverse content from stdin",
        gen_opts: true
    })]

    yield ["pet-info", createCommandV2(async ({ msg, args }) => {
        let pet_type = pet.hasPetByNameOrType(msg.author.id, args.join(" "))
        if (!pet_type[1]) {
            return { content: `${args.join(" ").toLowerCase()} is not a pet`, status: StatusCode.RETURN }
        }
        let petInfo = pet_type[1]
        let petType = pet_type[0]
        let petTypeInfo = pet.getPetShop()[petType]
        let embed = new EmbedBuilder()
        embed.setTitle(petInfo.name || petType)
        embed.addFields([
            { name: "Favorite food", value: petTypeInfo['favorite-food'], inline: true },
            { name: "HP", value: `${petInfo.health} / ${petTypeInfo['max-hunger']}`, inline: true }
        ])
        return { embeds: [embed], status: StatusCode.RETURN }
    }, CommandCategory.UTIL, "Gets information about a pet", {
        pet: createHelpArgument("The pet to get info on", true)
    })]

    yield [
        "has-role", ccmdV2(async ({ msg, argShapeResults }) => {
            let user = argShapeResults['user'] as string
            let role = argShapeResults['role'] as Role
            let member: GuildMember | undefined = await fetchUser(msg.guild as Guild, user)
            if (!member) {
                return { content: "No member found", status: StatusCode.ERR }
            }
            return { content: String(member.roles.cache.has(role.id)), status: StatusCode.RETURN }
        }, "Check if a user has a role", {
            helpArguments: {
                user: createHelpArgument("The user to checK", true),
                role: createHelpArgument("The role to check", true)
            },
            argShape: async function*(args, msg) {
                yield [args.advance(), "user"]
                yield msg.guild ? [await args.expectRole(msg.guild as Guild, truthy), "role"] : [BADVALUE, 'to be in a guild']
            }
        })
    ]

    yield [
        "units", createCommandV2(async ({ args, opts }) => {
            let roundTo = opts.getNumber("round-to", 10)
            if (opts.getDefault("l", false)) {
                let compareToUnit = opts.getString("l", "yd")
                let unitList: [typeof units.LengthUnit, number][] = []
                Object.entries(units).forEach(kv => {
                    unitList.push([kv[1], Number((new kv[1](1)).toUnit(units.LengthUnit.fromUnitName(compareToUnit)).value.toFixed(roundTo))])
                })
                return { content: unitList.sort((a, b) => a[1] - b[1]).map(v => `${v[0].longname} (${v[0].shorthand}) (${v[1]}${compareToUnit})`).join("\n"), status: StatusCode.RETURN }
            }
            if (args.length < 2) {
                return { content: "Command usage: `[units <number><unit> <convert-to-unit>`", status: StatusCode.ERR }
            }
            let number = Number(args[0])
            let unit;
            if (isNaN(number)) {
                unit = units.LengthUnit.fromUnitRepr(args[0] as `${number}${string}`)
            }
            else {
                args = new ArgList(args.slice(1))
                unit = new (units.LengthUnit.fromUnitName(args[0]))(number)
            }
            args = new ArgList(args.slice(1))
            for (let i = 0; i < args.length; i += 1) {
                unit = unit.toUnit(units.LengthUnit.fromUnitName(args[i]))
            }
            return { content: `${unit.value.toFixed(roundTo)}${units[unit.constructor.name as keyof typeof units].shorthand}`, status: StatusCode.RETURN }
        }, CommandCategory.UTIL, "Converts a unit to a different unit", {
            unit1: createHelpArgument("The first unit in the form of &lt;amount&gt;&lt;unit&gt;"),
            to: createHelpArgument("The unit to convert to"),
            unit2: createHelpArgument("The unit to convert to (use -l to see a list of units)")
        }, {
            l: createHelpOption("List units and compare them to a unit", undefined, "yd"),
            "round-to": createHelpOption("Round to a certain number of decimals", undefined, "10", true),
        })
    ]

    yield [
        "help", ccmdV2(async ({ rawOpts: opts, args, runtime_opts }) => {

            let baseCommands = { ...Object.fromEntries(getCommands().entries()) }

            if (runtime_opts.get("remote", false)) {
                let commandsToUse = args.length ? {} : baseCommands
                for (let arg of args) {
                    commandsToUse[arg] = baseCommands[arg]
                }
                let html = ''
                for (let [name, command] of Object.entries(commandsToUse)) {
                    if (!command) continue
                    let resultPriority = ""
                    html += generateHTMLFromCommandHelp(name, command as CommandV2).replace(`>${name}</h1>`, `>${name} ${resultPriority}</h1>`)
                }
                html += ""
                return crv(html, {
                    mimetype: "text/html"
                })
            }

            const matchCmds = getMatchCommands()

            let commands = { ...baseCommands, ...matchCmds }


            if (!Object.keys(opts).length && !args.length) {
                return crv("http://5.78.105.163:80/commands")
            }
            if (opts["g"]) {
                let text = fs.readFileSync("./website/help-web.html", "utf-8")
                return {
                    status: StatusCode.RETURN,
                    content: text
                }
            }
            if (opts['l']) {
                let category = String(opts['l']) || "all"
                let catNum = -1
                switch (category.toLowerCase()) {
                    case "meta":
                        catNum = CommandCategory.META
                        break;
                    case "util":
                        catNum = CommandCategory.UTIL
                        break;
                    case "game":
                        catNum = CommandCategory.GAME; break;
                    case "fun":
                        catNum = CommandCategory.FUN; break;
                    case "images": catNum = CommandCategory.IMAGES; break;
                    case "economy": catNum = CommandCategory.ECONOMY; break;
                    case "voice": catNum = CommandCategory.VOICE; break;
                    case "admin": catNum = CommandCategory.ADMIN; break;
                    case "match": catNum = CommandCategory.MATCH; break;
                }
                let rv = ""
                for (let cmd in commands) {
                    if (catNum == -1 || commands[cmd]?.category == catNum)
                        rv += `${cmd}: ${cmdCatToStr(commands[cmd]?.category)}\n`
                }
                return { content: rv, status: StatusCode.RETURN }
            }
            const aliasesV2 = getAliasesV2()
            let commandsToUse = { ...commands, ...aliasesV2 }
            if (args[0] && args[0] !== '?') {
                commandsToUse = {}
                for (let cmd of args) {
                    if (commands[cmd]) {
                        commandsToUse[cmd] = commands[cmd] as CommandV2
                    }
                    else if (matchCmds[cmd]) {
                        commandsToUse[cmd] = matchCmds[cmd]
                    }
                    else if (aliasesV2[cmd]) {
                        commandsToUse[cmd] = aliasesV2[cmd]
                    }
                    else { continue }
                }
            }
            if (opts['json']) {
                return { content: JSON.stringify(commandsToUse), status: StatusCode.RETURN, mimetype: "application/json" }
            }
            let text = ""

            let fn: (string: string, cmd: typeof commandsToUse[string]) => string
            let mimetype: MimeType = "plain/markdown"
            if (opts['s']) {
                fn = function() { return generateCommandSummary(arguments[0], arguments[1]) + "\n---------------------\n" }
            }
            else if (opts['d']) {
                fn = function() { return generateDocSummary(arguments[0], arguments[1]) + "\n---------------------\n" }
            }
            else if (opts['html']) {
                fn = function() { return generateHTMLFromCommandHelp(arguments[0], arguments[1]) + "<br>" }
                mimetype = "text/html"
            }
            else {
                fn = generateTextFromCommandHelp
            }
            for (let command in commandsToUse) {
                text += fn(command, commandsToUse[command])
            }
            return crv(text, {
                mimetype: mimetype
            })
        }, "Get help with specific commands", {
            helpArguments: {
                commands: createHelpArgument("The commands to get help on, seperated by a space<br>If command is ?, it will do all commands", false)
            },
            helpOptions: {
                "g": createHelpOption("List the bot syntax"),
                "s": createHelpOption("Only show a summary"),
                html: createHelpOption("Show html instead of markdown format"),
                l: createHelpOption("List commands in a category"),
            },
            docs: "<h3>Categories</h3><ul><li>game</li><li>fun</li><li>util</li><li>meta</li><li>images</li><li>economy</li><li>voice</li><li>admin</li><li>match</li></ul>"
        }),
    ]

    yield [
        "clear-logs", ccmdV2(async function({ msg, sendCallback }) {
            fs.readdir("./command-results/", (err, files) => {
                if (err) {
                    handleSending(msg, crv("Could not read command-results directory"), sendCallback)
                    return
                }
                for (let file of files) {
                    if (file.match(/log-\d+\.txt/)) {
                        fs.rmSync(`./command-results/${file}`)
                    }
                }
                handleSending(msg, crv("Cleared logs"), sendCallback)
            })
            return crv("clearing logs", { status: StatusCode.INFO })
        }, "Clears logs", {
            permCheck: m => configManager.ADMINS.includes(m.author.id)
        })
    ]

    yield [
        "ed", createCommandV2(async function({ msg, rawOpts: opts, args, recursionCount: rec, commandBans: bans, runtime_opts, symbols, pid_label }) {
            if (!isMsgChannel(msg.channel)) return { noSend: true, status: StatusCode.ERR }

            let state = this[1].state ?? {}

            if (state[msg.author.id]) {
                return { content: "Ur already editing", status: StatusCode.ERR }
            }
            let mode: "normal" | "insert" = "normal"
            let canEdit: (string | undefined)[] = String(opts['editors']).split(",")
            canEdit.push(msg.author.id)
            for (let i = 0; i < canEdit.length; i++) {
                canEdit[i] = (await fetchUserFromClientOrGuild(canEdit[i] as string))?.id || undefined
                if (canEdit[i] === undefined)
                    continue
                if (state[canEdit[i] as string])
                    canEdit[i] = undefined
            }
            canEdit = canEdit.filter(v => v)
            for (let ed of canEdit) {
                if (!ed) continue
                state[ed] = true
            }
            function parseNormalEdInput(input: string) {
                let cmds = "qnaipgsdg!"
                let range = ""
                let startArgs = false
                let cmd = ""
                let args = ""
                for (let i = 0; i < input.length; i++) {
                    let ch = input[i]
                    if (cmds.includes(ch) && !startArgs) {
                        range += cmd + args
                        cmd = ch
                        args = ""
                    }
                    else if (ch === " " && !startArgs) {
                        startArgs = true
                    }
                    else if (!cmd) {
                        range += ch
                    }
                    else if (cmd) {
                        args += ch
                    }
                }
                return [range, cmd, args]
            }

            function getLinesFromRange(range: string) {
                let m
                if (!range)
                    return [currentLine]
                if (Number(range)) {
                    return [Number(range)]
                }
                else if (range === ".") {
                    return [currentLine]
                }
                else if (range === "$") {
                    return [text.length]
                }
                else if (range === ",") {
                    return text.map((_v, i) => i + 1)
                }
                else if (m = range.match(/^(\d*),(\d*)$/)) {
                    let start = Number(m[1]) || 0
                    let end = undefined
                    if (m[2]) {
                        end = Number(m[2])
                    }
                    return text.slice(start - 1, end).map((_v, i) => i + start)
                }
                else {
                    let [search, _, __] = createSedRegex(range)
                    if (search) {
                        let rgx
                        try {
                            rgx = new RegExp(search, "g")
                        }
                        catch (err) {
                            handleSending(msg, { status: StatusCode.ERR, content: "? Invalid regex'" })
                            return [currentLine]
                        }
                        let validLines = []
                        for (let i = 0; i < text.length; i++) {
                            if (text[i]?.match(rgx)) {
                                validLines.push(i + 1)
                            }
                        }
                        if (validLines.length) {
                            return validLines
                        }
                        return [currentLine]
                    }
                }
                return [currentLine]
            }

            function addTextAtPosition(text: string[], textToAdd: string, position: number) {
                let number = position
                let dataAfter = text.slice(number)
                text[number] = textToAdd
                text = text.concat(dataAfter)
                for (let i = 0; i < number; i++) {
                    if (text[i] === undefined)
                        text[i] = ""
                }
                currentLine = position + 1
                return text
            }

            function createSedRegex(str: string, buildReplace = false) {
                let searchRegex = ""
                let replaceWith = ""
                let flags = ""
                let delimiter = str[0]

                let escape = false
                let searchDone = false
                let replaceDone = false

                str = str.slice(1)
                for (let char of str) {
                    if (char == "\\") {
                        escape = true
                        continue
                    }
                    else if (char === delimiter && searchRegex && !escape) {
                        if (!buildReplace)
                            break
                        searchDone = true
                    }
                    else if (char === delimiter && searchDone && !escape) {
                        replaceDone = true
                    }
                    else if (!searchDone) {
                        if (escape) searchRegex += "\\"
                        searchRegex += char
                    }
                    else if (!replaceDone) {
                        if (escape) replaceWith += "\\"
                        replaceWith += char
                    }
                    else if (replaceDone) {
                        if (escape) flags += "\\"
                        flags += char
                    }
                    escape = false
                }
                return [searchRegex, replaceWith, flags]
            }

            async function handleTextInMode(textStr: string) {
                if (mode === "normal") {
                    let [range, cmd, cmdArgs] = parseNormalEdInput(textStr)
                    if (edCmds[cmd]) {
                        if (!(await edCmds[cmd](range, cmdArgs))) {
                            return false
                        }
                    }
                    else if (!isNaN(Number(range))) {
                        currentLine = Number(range)
                    }

                    else if (!opts['exec']) {
                        await handleSending(msg, { status: StatusCode.ERR, content: "?" })
                    }
                }
                else {
                    if (textStr === '.') {
                        mode = "normal"
                    }
                    else {
                        text = addTextAtPosition(text, textStr, currentLine)
                    }
                }
                return true
            }

            let text: string[] = []
            let currentLine = 0
            if (opts['text-after']) {
                let newArgs;
                [newArgs, ...text] = args.join(" ").split(String(opts['text-after']))
                args = new ArgList(newArgs.split(" "))
                text = text.join(String(opts['text-after'])).split("\n").map(v => v.trim())
                currentLine = text.length
            }
            let commandLines = [0]
            let edCmds: { [key: string]: (range: string, args: string) => any } = {
                i: async (range, args) => {
                    commandLines = getLinesFromRange(range)
                    if (args) {
                        text = addTextAtPosition(text, args, commandLines[0])
                    }
                    else {
                        mode = "insert"
                    }
                    return true
                },
                a: async (range, args) => {
                    commandLines = getLinesFromRange(range).map(v => v - 1 >= 0 ? v - 1 : 0)
                    if (args) {
                        text = addTextAtPosition(text, args, commandLines[0])
                    }
                    else {
                        mode = "insert"
                    }
                    return true
                },
                d: async (range, _args) => {
                    commandLines = getLinesFromRange(range).map(v => v - 1 >= 0 ? v - 1 : 0)
                    text = text.filter((_v, i) => !commandLines.includes(i))
                    if (text.length < currentLine)
                        currentLine = text.length
                    return true
                },
                p: async (range, _args) => {
                    commandLines = getLinesFromRange(range).map(v => v - 1)
                    let textToSend = ""
                    for (let line of commandLines) {
                        textToSend += text[line] + "\n"
                    }
                    await handleSending(msg, { status: StatusCode.INFO, content: textToSend })
                    return true
                },
                n: async (range, _args) => {
                    commandLines = getLinesFromRange(range).map(v => v - 1)
                    let textToSend = ""
                    for (let line of commandLines) {
                        textToSend += `${String(line + 1)} ${text[line]}\n`
                    }
                    await handleSending(msg, { status: StatusCode.INFO, content: textToSend })
                    return true
                },
                s: async (range, args) => {
                    commandLines = getLinesFromRange(range).map(v => v - 1)
                    let [searchRegex, replaceWith, flags] = createSedRegex(args, true)
                    let rgx
                    try {
                        rgx = new RegExp(searchRegex, flags)
                    }
                    catch (err) {
                        await handleSending(msg, { status: StatusCode.INFO, content: "? Invalid regex'" })
                        return true
                    }
                    for (let line of commandLines) {
                        let newText = text[line].replace(rgx, replaceWith)
                        text[line] = newText
                    }
                    return true
                },
                "!": async (range, args) => {
                    commandLines = getLinesFromRange(range).map(v => v - 1)
                    if (args) {
                        for (let i = 0; i < commandLines.length; i++) {
                            let textAtLine = text[commandLines[i]]
                            vars.setVar("__ed_line", textAtLine, msg.author.id)
                            let rv;
                            for await (rv of cmds.runcmdv2({
                                msg, command: args, prefix: "", runtime_opts, symbols, pid_label
                            }));
                            let t = getContentFromResult(rv ?? { noSend: true, status: 0 }, "\n").trim()
                            vars.delVar("__ed_line", msg.author.id)
                            text[commandLines[i]] = t
                        }
                    }
                    return true
                },
                q: async () => {
                    return false
                }
            }

            if (opts['exec']) {
                for (let line of args.join(" ").split("\n")) {
                    if (!(await handleTextInMode(line))) {
                        break
                    }
                }
            }
            else {
                while (true) {
                    let m
                    try {
                        m = (await msg.channel.awaitMessages({ filter: m => canEdit.includes(m.author.id), max: 1, time: 60000, errors: ["time"] })).at(0)
                    }
                    catch (err) {
                        for (let ed in state) {
                            delete state[ed]
                        }

                        return { content: "Timeout", status: StatusCode.ERR }
                    }
                    if (!m) break
                    if (!(await handleTextInMode(m.content))) {
                        break
                    }
                }
            }
            for (let ed in state) {
                delete state[ed]
            }
            if (opts['s']) {
                return { noSend: true, status: StatusCode.RETURN }
            }
            return { content: text.join("\n"), status: StatusCode.RETURN }
        }, CommandCategory.UTIL, `The excellent unix ed command<br><lh>Modes</lh>
<ul>
    <li>normal</li>
    <li>insert</li>
</ul>
<b>Normal mode</b>
<p indent=1>
    The general way to use a normal mode command is<br>
    <code>[range]&lt;command&gt;[args...]</code><br>
    All commands are 1 character
</p>
<lh>commands</lh>
<ul>
    <li>
        <b>i</b>: enter insert mode on line <code>range</code><br>
        or the current line if not given.<br>
        if <code>args</code> are given, it will insert the args and stay in normal mode.
    </li>
    <li>
        <b>a</b>: enter insert mode at the end of the text because its broken
    </li>
    <li>
        <b>d</b>: delete <code>range</code> lines or the current line.
    </li>
    <li>
        <b>p</b>: print <code>range</code> lines or the current line.
    </li>
    <li>
        <b>n</b>: same as <b>p</b> and also numbers the lines.
    </li>
    <li>
        <b>s</b>: runs a find/replace on <code>range</code> liens or the current line.
    </li>
    <li>
        <b>!</b>: replaces <code>range</code> lines with the output of a bircle command.
    </li>
    <li><b>q</b>: quit</li>
</ul>
<b>Insert</b>
<p indent=1>
    To exit insert mode do <code>.</code>
</p>`, {
            "...exec": createHelpArgument("If -exec is given, treat arguments as ed commands")
        }, {
            "exec": createHelpOption("Treat arguments as ed commands")
        }
        ),
    ]

    yield [
        "stk", createCommandV2(async ({ msg, args, sendCallback }) => {
            https.get(`https://www.google.com/search?q=${encodeURI(args.join(" "))}+stock`, resp => {
                let data = new Stream.Transform()
                resp.on("data", chunk => {
                    data.push(chunk)
                })
                resp.on("end", async () => {
                    let html = data.read().toString()
                    let embed = new EmbedBuilder()
                    let stockData = html.match(/<div class="BNeawe iBp4i AP7Wnd">(.*?)<\/div>/)
                    if (!stockData) {
                        await handleSending(msg, { status: StatusCode.ERR, content: "No data found" }, sendCallback)
                        return
                    }
                    stockData = stockData[0]
                    let price = stockData.match(/>(\d+\.\d+)/)
                    if (!price) {
                        await handleSending(msg, { status: StatusCode.ERR, content: "No price found" }, sendCallback)
                        return
                    }
                    price = price[1]
                    let change = stockData.match(/(\+|-)(\d+\.\d+)/)
                    if (!change) {
                        await handleSending(msg, { status: StatusCode.ERR, content: "No change found" }, sendCallback)
                        return
                    }
                    change = `${change[1]}${change[2]}`
                    let numberchange = Number(change)
                    let stockName = html.match(/<span class="r0bn4c rQMQod">([^a-z]+)<\/span>/)
                    if (!stockName) {
                        await handleSending(msg, { status: StatusCode.ERR, content: "Could not get stock name" }, sendCallback)
                        return
                    }
                    stockName = stockName[1]
                    if (numberchange > 0) {
                        embed.setColor("Green")
                    }
                    else {
                        embed.setColor("Red")
                    }
                    embed.setTitle(stockName)
                    embed.addFields(efd(["Price", price]))
                    embed.addFields(efd(["Price change", change, true]))
                    await handleSending(msg, { status: StatusCode.RETURN, embeds: [embed] }, sendCallback)
                })
            }).end()
            return { content: "Getting data", status: StatusCode.INFO }
        }, CommandCategory.UTIL,
            "Gets the stock symbol for a stock"
        ),
    ]

    yield [
        "heist-info", ccmdV2(async function({ args }) {
            let action = args[0] || 'list-types'
            let text = ""
            let responses = fs.readFileSync("./command-results/heist", "utf-8").split("\n").map(v => v.split(":").slice(1).join(":").replace(/;END$/, "").trim())
            switch (action) {
                case "list-responses": {
                    text = responses.join("\n")
                    break
                }
                case "locations":
                case "list-locations": {
                    let locations: string[] = ["__generic__"]
                    for (let resp of responses) {
                        let location = resp.match(/(?<!SET_)LOCATION=([^ ]+)/)
                        let locationText = location?.[1]
                        if (locationText && !locations.includes(locationText)) {
                            locations.push(locationText)
                        }
                    }
                    text = `LOCATIONS:\n${locations.join("\n")}`
                    break
                }
                case "stages":
                case "list-stages": {
                    let stages: string[] = ["getting_in", "robbing", "escape", "end"]
                    for (let resp of responses) {
                        let stage = resp.match(/STAGE=([^ ]+)/)
                        if (!stage?.[1]) continue;
                        let stageText = stage[1]
                        if (stageText && !stages.includes(stageText)) {
                            stages.push(stageText)
                        }
                    }
                    text = `STAGES:\n${stages.join("\n")}`
                    break
                }

                case "list-types": {
                    let locations: string[] = ["__generic__"]
                    let stages: string[] = ["getting_in", "robbing", "escape", "end"]
                    for (let resp of responses) {
                        let stage = resp.match(/STAGE=([^ ]+)/)
                        if (!stage?.[1]) continue;
                        let location = resp.match(/(?<!SET_)LOCATION=([^ ]+)/)
                        let locationText = location?.[1]
                        let stageText = stage[1]
                        if (locationText && !locations.includes(locationText)) {
                            locations.push(locationText)
                        }
                        if (stageText && !stages.includes(stageText)) {
                            stages.push(stageText)
                        }
                    }
                    text = `LOCATIONS:\n${locations.join("\n")}\n---------------------\nSTAGES:\n${stages.join("\n")}`
                    break
                }
                case "search": {
                    let query = args[1]
                    if (!query) {
                        text = "No search query"
                        break
                    }
                    let results = []
                    for (let i = 0; i < responses.length; i++) {
                        try {
                            if (responses[i].match(query)) {
                                results.push([i + 1, responses[i]])
                            }
                        }
                        catch (err) {
                            return { content: `${query} is an invalid regular expression`, status: StatusCode.ERR }
                        }
                    }
                    text = `RESULTS\n-------------------------\n${results.map(v => `${v[0]}: ${v[1]}`).join("\n")}`
                    break
                }
                default: {
                    text = `${action} is not a valid action`
                    break
                }
            }
            return { content: text.replaceAll(/__/g, "\\_") || "nothing", status: StatusCode.RETURN }
        }, "Get information about heist responses", {
            helpArguments: {
                type: createHelpArgument(`The type of information can be:<br>
<ul>
    <li>list-locations</li>
    <li>list-stages</li>
    <li>list-responses</li>
    <li>list-types</li>
    <li>search (requires search query)</li>
</ul>`, true),
                search_query: createHelpArgument("The search query if type is <code>search</code>", false, "type")
            }
        })
    ]

    yield [
        "ustock", ccmdV2(async function({ msg, argShapeResults }) {
            let user = argShapeResults['user'] as string || msg.author.id
            let member = await fetchUserFromClientOrGuild(user, msg.guild)
            if (!member) member = msg.author || undefined
            let stockName = argShapeResults['stock'] as string
            return { content: JSON.stringify(economy.userHasStockSymbol(member.id || "", stockName)), status: StatusCode.RETURN }
        }, "Check if a user has a stock", {
            helpArguments: {
                stockName: createHelpArgument("The stock to check if the user has"),
                user: createHelpArgument("The user to check")
            },
            argShape: async function*(args) {
                yield [args.expectString(), "stock"]
                yield [args.expectString(), "user", true]
            }
        })
    ]

    yield [
        "gapet", ccmdV2(async function({ args, msg }) {
            let user = await fetchUserFromClientOrGuild(args[0] || msg.author.id, msg.guild ?? undefined)
            if (!user) return crv(`Could not find user: ${args[0]}`, { status: StatusCode.ERR })
            return { content: String(pet.getActivePet(user.id || "")), status: StatusCode.RETURN }

        }, "Gets the current active pet of a user", {
            helpArguments: {
                user: createHelpArgument("The user to get the active pet of", false, undefined, "Yourself")
            }
        })
    ]

    yield [
        "sapet",
        ccmdV2(async function({ msg, args }) {
            let newActivePet = args[0]
            if (!pet.hasPetByNameOrType(msg.author.id, newActivePet)[1]) {
                return { content: `You do not have a ${newActivePet}`, status: StatusCode.ERR }
            }
            if (pet.setActivePet(msg.author.id, newActivePet)) {
                return { content: `Your new active pet is ${newActivePet}`, status: StatusCode.RETURN }
            }
            return { content: "Failed to set active pet", status: StatusCode.ERR }

        }, "Sets your active pet", {
            helpArguments: {
                pet: createHelpArgument("The pet to set to")
            }
        })
    ]

    yield [
        "surround-text", createCommandV2(async ({ args, opts, stdin }) => {
            let maxWidth = opts.getNumber("max-width", 50)
            let vertChar = opts.getString("vert-char", "|")
            let horChar = opts.getString("hor-char", "-")
            let text = stdin ? getContentFromResult(stdin, "\n").split("\n") : args.join(" ").split("\n")
            let lines = [horChar.repeat(maxWidth + 2)]
            //FIXME: make sure each $line_of_text is at most $maxWidth
            for (let line_of_text of text) {
                if (line_of_text.length > maxWidth) {
                    for (let i = 0; i < line_of_text.length + maxWidth; i += maxWidth) {
                        let t = line_of_text.slice(i, i + maxWidth)
                        lines.push(`${vertChar}${" ".repeat((maxWidth - t.length) / 2)}${t}${" ".repeat((maxWidth - t.length) / 2)}${vertChar}`)
                    }
                    continue
                }
                lines.push(`${vertChar}${" ".repeat((maxWidth - line_of_text.length) / 2)}${line_of_text}${" ".repeat((maxWidth - line_of_text.length) / 2)}${vertChar}`)

            }
            lines.push(horChar.repeat(maxWidth + 2))
            return { content: `\`\`\`\n${lines.join("\n")}\n\`\`\``, status: StatusCode.RETURN }
        }, CommandCategory.UTIL, "Surrounds text with a character"),
    ]

    yield [
        "align-table",
        createCommandV2(async ({ opts, args, stdin }) => {
            let align = opts.getString("align", "left")
            let raw = opts.getBool("raw", false)
            let columnCounts = opts.getBool("cc", false)
            let table = stdin ? getContentFromResult(stdin, "\n") : args.join(" ")
            let columnLongestLengths: { [key: number]: number } = {}
            let longestRow = 0
            let rows = table.split("\n")
            let finalColumns: string[][] = []
            for (let row of rows) {
                let columns = row.split("|")
                let nextColumn = []
                for (let i = 0; i < columns.length; i++) {
                    nextColumn.push(columns[i])
                    if (i > longestRow)
                        longestRow = i
                }
                finalColumns.push(nextColumn)
            }
            for (let row of finalColumns) {
                for (let i = row.length - 1; i < longestRow; i++) {
                    row.push("")
                }
            }
            if (raw) {
                return { content: `\\${JSON.stringify(finalColumns)}`, status: StatusCode.RETURN }
            }
            for (let row of finalColumns) {
                for (let i = 0; i < row.length; i++) {
                    if (!columnLongestLengths[i]) {
                        columnLongestLengths[i] = 0
                    }
                    if (row[i].length > columnLongestLengths[i]) {
                        columnLongestLengths[i] = row[i].length
                    }
                }
            }
            if (columnCounts) {
                let text = ""
                for (let i = 0; i < finalColumns[0].length; i++) {
                    text += `(col: ${i + 1}): ${columnLongestLengths[i]}\n`
                }
                return { content: text, status: StatusCode.RETURN }
            }
            let newText = "```"
            for (let row of finalColumns) {
                for (let i = 0; i < row.length; i++) {
                    let col = row[i].replace(/^\|/, "").replace(/\|$/, "")
                    let maxLength = columnLongestLengths[i]
                    if (maxLength == 0) {
                        continue
                    }
                    else {
                        newText += "|"
                    }
                    if (col.length < maxLength) {
                        if (col.match(/^-+$/)) {
                            col = mulStr("-", maxLength)
                        }
                        else {
                            if (align == "left")
                                col = col + mulStr(" ", maxLength - col.length)
                            else if (align == "right")
                                col = mulStr(" ", maxLength - col.length) + col
                            else if (align == "center")
                                col = mulStr(" ", Math.floor((maxLength - col.length) / 2)) + col + mulStr(" ", Math.ceil((maxLength - col.length) / 2))
                        }
                    }
                    newText += `${col}`
                }
                newText += '|\n'
            }
            return { content: newText + "```", status: StatusCode.RETURN }

        }, CommandCategory.UTIL, "Align a table", {
            table: createHelpArgument("The markdown formatted table to align, can be given through pipe")
        }, {
            align: createHelpOption("Align either: <code>left</code>, <code>center</code> or <code>right</code>"),
            raw: createHelpOption("Give a javascript list containing lists of columns"),
            cc: createHelpOption("Give the length of the longest column in each column")
        })
    ]

    yield [
        "calcet", ccmdV2(async function({ args, rawOpts: opts }) {
            let fmt = String(opts['fmt'] || "Money: %m\nStocks: %s\nLoans: %l\n---------------------\nGRAND TOTAL: %t")
            let reqAmount = args.join(" ") || "all!"
            let { money, stocks, loan, total: _ } = economy.economyLooseGrandTotal()
            let moneyAmount = amountParser.calculateAmountRelativeTo(money, reqAmount)
            let stockAmount = amountParser.calculateAmountRelativeTo(stocks, reqAmount)
            let loanAmount = amountParser.calculateAmountRelativeTo(loan, reqAmount)
            let grandTotal = amountParser.calculateAmountRelativeTo(money + stocks - loan, reqAmount)
            return { content: format(fmt, { m: String(moneyAmount), s: String(stockAmount), l: String(loanAmount), t: String(grandTotal) }), status: StatusCode.RETURN }
        }, "Calculate the net worth of the economy", {
            options: {
                "fmt": {
                    description: "The format<br><ul><li>m: The money</li><li>s: The stocks</li><li>l: The loans</li><li>t: total</li>"
                }
            }
        })
    ]

    yield [
        "calcm", ccmdV2(async function({ rawOpts: opts, msg, args }) {
            let dollarSign = opts['sign'] || ""
            let as = opts['as'] || msg.author.id
            if (as && typeof as === 'string') {
                as = (await fetchUserFromClientOrGuild(as, msg.guild))?.id || msg.author.id
            }
            if (typeof as !== 'string' || !as)
                as = msg.author.id

            if (opts['tree']) {
                return crv(amountParser.calculateAmountRelativeToInternals(economy.calculateAmountFromString(String(as), "100%"), args.join(" "), {
                    ticketmin: (total, _k) => total * 0.005,
                    battlemin: (total, _k) => total * 0.002
                }).expression.repr(0))
            }

            let amount = economy.calculateAmountFromString(String(as), args.join(" "), {
                ticketmin: (total, _k) => total * 0.005,
                battlemin: (total, _k) => total * 0.002
            })
            if (dollarSign === true) {
                return { content: `${amount}`, status: StatusCode.RETURN }
            }
            return { content: `${dollarSign}${amount}`, status: StatusCode.RETURN }
        }, "Calculate balance", {
            arguments: {
                amount: createHelpArgument("The amount to calculate", true),
            },
            options: {
                sign: createHelpOption("The currency symbol"),
                as: createHelpOption("Get the balance of a different user")
            }
        })
    ]

    yield [
        "calcl", ccmdV2(async function({ rawOpts: opts, msg, args }) {
            let dollarSign = opts['sign'] || ""
            let as = opts['as'] || msg.author.id
            if (as && typeof as === 'string') {
                as = (await fetchUserFromClientOrGuild(as, msg.guild))?.id || msg.author.id
            }
            if (typeof as !== 'string' || !as)
                as = msg.author.id
            let amount = economy.calculateLoanAmountFromString(String(as), args.join(" "))
            if (!amount) {
                return { content: "None", status: StatusCode.RETURN }
            }
            if (dollarSign === true) {
                return { content: `${amount}`, status: StatusCode.RETURN }
            }
            return { content: `${dollarSign}${amount}`, status: StatusCode.RETURN }
        }, "Calculate loan", {
            arguments: {
                amount: createHelpArgument("The amount to calculate", true),
            },
            options: {
                sign: createHelpOption("The currency symbol"),
                as: createHelpOption("Get the loan of a different user")
            }
        })
    ]


    yield [
        "calcms", ccmdV2(async function({ rawOpts: opts, msg, args }) {
            let dollarSign = opts['sign'] || ""
            let as = opts['as'] || msg.author.id
            if (as && typeof as === 'string') {
                as = (await fetchUserFromClientOrGuild(as, msg.guild))?.id || msg.author.id
            }
            if (typeof as === 'boolean' || !as)
                as = msg.author.id
            let amount = economy.calculateAmountFromNetWorth(String(as), args.join(" ").trim())
            if (dollarSign === true) {
                return { content: `${amount}`, status: StatusCode.RETURN }
            }
            return { content: `${dollarSign}${amount}`, status: StatusCode.RETURN }
        }, "Calculate total worth", {
            arguments: {
                amount: createHelpArgument("The amount to calculate", true),
            },
            options: {
                sign: createHelpOption("The currency symbol"),
                as: createHelpOption("Get the total worth of a different user")
            }
        })
    ]

    yield ["relscript", ccmdV2(async function({ msg, args, opts, stdin }) {
        if (opts.getBool('docs', false)) {
            return {
                files: [
                    crvFile("src/amount-parser-docs.md", "amount-parser.md", "amount parser docs")
                ]
            }
        }
        let text = stdin ? getContentFromResult(stdin) : args.join(" ")
        if (!text) return crv("Expected code", { status: StatusCode.ERR })
        let relativeTo = opts.getNumber("r", 0)
        if (opts.getBool("tree", false)) {
            return crv(amountParser.calculateAmountRelativeToInternals(relativeTo, text).expression.repr())
        }
        else if (opts.getBool("s", false)) {
            let symbolTable;
            do {
                let internals = amountParser.calculateAmountRelativeToInternals(relativeTo, text, symbolTable)
                await handleSending(msg, crv(internals.interpreter.visit().toString()))
                symbolTable = internals.interpreter.symbolTable
                let m = await promptUser(msg, undefined, undefined, { timeout: 60000 })
                if (!m) break;
                if (m.content === '.exit') break;
                text = m.content
            } while (true);
        }
        return crv(amountParser.runRelativeCalculator(relativeTo, text).toString())
    }, "Runs relscript", {
        helpOptions: {
            r: createHelpOption("Set the relative number", undefined, "0"),
            s: createHelpOption("run a REPL<br>type <code>.exit</code> to exit the REPL"),
            tree: createHelpOption("See the ast"),
            docs: createHelpOption("Send the docs"),
        }, helpArguments: {
            code: createHelpArgument("The code to run")
        },
        accepts_stdin: "The code to run"
    })]

    yield [
        "calcam", ccmdV2(async function({ rawOpts: opts, args }) {
            let [moneyStr, ...reqAmount] = args
            let amountStr = reqAmount.join(" ")
            let money = Number(moneyStr)
            if (isNaN(money)) {
                return { content: `${moneyStr} is not a number`, status: StatusCode.ERR }
            }
            let dollarSign = opts['sign'] || ""
            if (opts['tree']) {
                return crv(amountParser.calculateAmountRelativeToInternals(money, amountStr).expression.repr(0))
            }
            let amount = [NaN];
            amount = [amountParser.calculateAmountRelativeTo(money, amountStr)]
            if (dollarSign === true) {
                return { content: `${amount.join("\n")}`, status: StatusCode.RETURN }
            }
            return { content: amount.map(v => `${dollarSign}${v}`).join("\n"), status: StatusCode.RETURN }
        }, "Calculate an amount", {
            arguments: {
                total: createHelpArgument("The total to start with", true),
                amount: createHelpArgument("The amount of the total to calculate", true)
            },
            options: {
                sign: createHelpOption("The currency symbol", undefined, ""),
                tree: createHelpOption("See the calculation syntax tree")
            }
        })
    ]

    yield [
        "aheist", createCommandV2(async ({ msg, args, rawOpts: opts }) => {
            let text = args.join(" ")
            let damageUsers: string | boolean | undefined = opts['lose'] || opts['l']
            let healUsers = opts['gain'] || opts['g']
            let amounts = ['none', 'normal', 'medium', 'large', "cents"]
            let givenAmount = opts['amount'] || opts['a']
            let stage = opts['stage'] || opts['s']
            let substage = opts['sub-stage'] || opts['ss']
            let isNeutral = Boolean(opts['neutral'])
            let location = opts['location']
            let set_location = opts['set-location']
            let button_response = opts['button-response']
            let condition = opts['if']
            if (isNeutral) {
                givenAmount = 'none'
                healUsers = 'all'
                damageUsers = undefined
            }
            let textOptions = ""
            if (typeof stage !== 'string') {
                return { content: `You did not provide a valid stage`, status: StatusCode.ERR }
            }
            if (typeof substage !== 'undefined' && typeof substage !== 'string') {
                return { content: "You did not provide a valid substage", status: StatusCode.ERR }
            }
            if (typeof givenAmount !== 'string') {
                return { content: `You must provide an amount (${amounts.join(", ")})`, status: StatusCode.ERR }
            }
            if (typeof damageUsers !== 'string' && typeof healUsers !== 'string') {
                return { content: `You must provide a user to lose/gain`, status: StatusCode.ERR }
            }
            if (damageUsers !== undefined && typeof damageUsers !== 'string') {
                return { content: "-lose must be a user number or all", status: StatusCode.ERR }
            }
            if (healUsers !== undefined && typeof healUsers !== 'string') {
                return { content: "-gain must be a user number or all", status: StatusCode.ERR }
            }
            if (!amounts.includes(givenAmount)) {
                return { content: `You did not provide a valid amount (${amounts.join(", ")})`, status: StatusCode.ERR }
            }
            if (damageUsers && healUsers) {
                return { content: "Only -lose or -gain can be given, not both", status: StatusCode.ERR }
            }
            if (damageUsers) {
                if (!damageUsers.match(/(?:(\d+|all),?)+/)) {
                    return { content: "Users must be numbers seperated by ,", status: StatusCode.ERR }
                }
                textOptions += ` LOSE=${damageUsers}`
            }
            if (healUsers) {
                if (!healUsers.match(/(?:(\d+|all),?)+/)) {
                    return { content: "Users must be numbers seperated by ,", status: StatusCode.ERR }
                }
                textOptions += ` GAIN=${healUsers}`
            }
            textOptions += ` STAGE=${stage}`
            if (substage) {
                textOptions += ` SUBSTAGE=${substage}`
            }
            if (location && typeof location === 'string') {
                textOptions += ` LOCATION=${location}`
            }
            if (set_location && typeof set_location === 'string') {
                textOptions += ` SET_LOCATION=${set_location}`
                if (button_response && typeof button_response === 'string') {
                    textOptions += ` BUTTONCLICK=${button_response} ENDBUTTONCLICK`
                }
            }
            if (condition && typeof condition === 'string') {
                textOptions += ` IF=${condition}`
            }
            fs.appendFileSync("./command-results/heist", `${msg.author.id}: ${text} AMOUNT=${givenAmount} ${textOptions};END\n`)
            return { content: `Added\n${text} AMOUNT=${givenAmount} ${textOptions}`, status: StatusCode.RETURN }
        }, CommandCategory.UTIL,
            "Add a heist prompt with a nice ui ™️",
            {
                "text": createHelpArgument("The text to show<br>{user1} will be replaced with user1, {user2} with user2, etc...<br>{userall} will be replaced with every user<br>{amount} will be replaced with the amount gained/losed<br>{+amount} will show amount with a + sign in front (even if it should  be negative), same thing with -<br>{=amount} will show amount with  no sign", true),
            },
            {
                "gain": createHelpOption("The user(s) to heal", ['g']),
                "lose": createHelpOption("The user(s) to damage", ['l']),
                "stage": createHelpOption("the stage of the game that the message is for (getting_in, robbing, escape)", ['s']),
                "amount": createHelpOption("The amount to gain/lose, (normal, medium, large)", ['a']),
                "location": createHelpOption("Specify the location that the response takes place at"),
                "set-location": createHelpOption("Specify the location that  the response takes you to<br>seperate locations with | for the user to choose where they want to go<br>(builtin locations: \\_\\_generic__, \\_\\_random\\_\\_)"),
                "button-response": createHelpOption("Specify the message sent after the button is clicked, if the user can chose the location<br>{location} will be replaced with the location the user picked<br>{user} will be replaced with  the user who clicked the button<br>If this is not given, nothing will be sent"),
                "sub-stage": createHelpOption("Specify the stage that happens after this response (builtin stages: getting_in, robbing, escape, end)"),
                "if": createHelpOption("Specify a condition in the form of &gt;x, &lt;x or =x, where x is the total amount of money gained/lost from heist<br>This response will only happen if the total amount of money is >, <, or = to x"),
            }
        ),
    ]

    yield [
        "periodic-table", ccmdV2(async function({ rawOpts: opts, args }) {


            let reqElem = args.join(" ")

            if (opts['an'] || opts['n']) {
                reqElem += `AtomicNumber=${opts['n']}`
            }

            if (!reqElem && !opts['r']) {
                return { content: "No element requesed", status: StatusCode.ERR }
            }

            if (opts['refresh']) {
                let data = await fetch("https://www.rsc.org/periodic-table/")
                let text = await data.text()
                let elementsData = text.match(/var elementsData = (.*);/)
                if (!elementsData?.[1]) {
                    return { content: "Could not fetch data", status: StatusCode.ERR }
                }
                fs.writeFileSync("./data/elements.json", elementsData[1])
            }

            let elementsData = fs.readFileSync("./data/elements.json", "utf-8")
            let elementsJSON = JSON.parse(elementsData)["Elements"]

            let [attr, value] = reqElem.split("=").map(v => v.trim())
            let reqElementData;
            if (opts['r']) {
                let count = Number(opts['r']) || 1
                reqElementData = []
                for (let i = 0; i < count; i++) {
                    reqElementData.push(choice(elementsJSON))
                }
            }
            else {
                reqElementData = elementsJSON.filter((v: any) => {
                    if (v[attr] !== undefined && String(v[attr]).trim().toLowerCase() === value.trim().toLowerCase()) {
                        return true
                    }
                    return v.Symbol.toLowerCase() === reqElem.toLowerCase() || v.Name.toLowerCase() === reqElem.toLowerCase()
                })
            }
            if (!reqElementData.length) {
                return { content: "No  element  found", status: StatusCode.ERR }
            }

            if (opts['list-attributes']) {
                let text = ""
                for (let attr in reqElementData[0]) {
                    text += `**${attr}**: ${reqElementData[0][attr]}\n`
                }
                return { content: text, status: StatusCode.RETURN }
            }


            let embeds = []
            let elementsNamesList = []
            for (let element of reqElementData) {
                let embed = new EmbedBuilder()
                elementsNamesList.push(`${element.Name} (${element.Symbol})`)
                embed.setTitle(`${element.Name} (${element.Symbol})`)
                embed.setDescription(`Discovered in ${element.DiscoveryYear == "0" ? "Unknown" : element.DiscoveryYear} by ${element.DiscoveredBy == "-" ? "Unknown" : element.DiscoveredBy}`)
                embed.addFields(efd(["Atomic Number", String(element.AtomicNumber),], ["Atomic Mass", String(element.RelativeAtomicMass)], ["Melting Point C", String(element.MeltingPointC) || "N/A", true], ["Boiling Point C", String(element.BoilingPointC) || "N/A", true]))
                embeds.push(embed)
            }
            if (embeds.length > 10 || opts['list-names']) {
                return { content: elementsNamesList.join("\n"), status: StatusCode.RETURN }
            }
            return { embeds: embeds, status: StatusCode.RETURN }
        }, "Get information on elements", {
            arguments: {
                "element_or_search": {
                    description: "Can either be a search, eg: ElementID=1<br>or an element, eg: h",
                    required: true
                }
            },
            options: {
                n: createHelpOption("Get the element with an atomic number", ["an"]),
                "list-names": createHelpOption("List the names of all found elements"),
                "r": createHelpOption("get n random elements", undefined, "if -r is used: 1"),
                "list-attributes": createHelpOption("List all attributes of an element"),
                refresh: createHelpOption("Refresh the periodic table")
            }
        })
    ]

    yield [
        "rand-arg", ccmdV2(
            async ({ args }) => {
                return { content: choice(args), status: StatusCode.RETURN }
            }, "Sends a random argument", {
            helpArguments: {
                "...args": createHelpArgument("The args to pick from")
            }
        }
        )
    ]

    yield [
        "yt", ccmdV2(async function({ msg, rawOpts: opts, args, runtime_opts }) {
            let instance = 'https://vid.puffyan.us'

            let pageNo = Number(opts['page'] as string) || 1

            let res = await fetch(`${instance}/api/v1/search?q=${encodeURI(args.join(" "))}&page=${encodeURI(String(pageNo))}&type=video`)
            let jsonData = await res.json()

            let valid_thumbnail_qualities = [
                "maxres",
                "maxresdefault",
                "sddefault",
                "high",
                "medium",
                "default",
                "start",
                "middle",
                "end"
            ]
            let thumbnail_quality = valid_thumbnail_qualities.filter(v => v === opts['thumb-quality'])[0] || "high"


            if (opts['list']) {
                let fmt = opts['list']
                if (fmt == true) {
                    fmt = "%l\n"
                }

                let string = ""
                for (let res of jsonData) {
                    string += format(fmt, { l: `https://www.youtube.com/watch?v=${res.videoId}` || "N/A", t: res.title || "N/A", c: res.author || "N/A", d: res.lengthSeconds || "N/A", v: res.viewCount || "N/A", u: res.publishedText || "N/A" })
                }

                return { content: string, status: StatusCode.RETURN }
            }

            let pagedEmbed = new common_to_commands.PagedEmbed(msg, [], "yt")

            let pages = jsonData.length
            let i = 0

            for (let res of jsonData) {
                i++;
                let e = new EmbedBuilder()
                e.setTitle(String(res['title']))
                e.setURL(`https://www.youtube.com/watch?v=${res.videoId}`)

                if (res.description) {
                    e.setDescription(res.description)
                }

                e.setFooter({ text: `https://www.youtube.com/watch?v=${res.videoId}\n${i}/${pages}` })

                e.setImage(res.videoThumbnails?.filter((v: any) => v.quality == thumbnail_quality)[0].url)

                pagedEmbed.embeds.push(e)

                pagedEmbed.addButton(`json.${res.videoId}`, { label: "JSON", style: ButtonStyle.Secondary, customId: `yt.json.${res.videoId}:${msg.author.id}` }, (int) => {
                    console.log(int, "clicked")
                    //2 magic number because yt.json.<id>
                    let yt_id = int.customId.split(":")[0].split(".")[2]
                    let json_data = jsonData.filter((v: any) => v.videoId == yt_id)[0]
                    const fn = cmdFileName`yt ${msg.author.id} json`
                    fs.writeFileSync(fn, JSON.stringify(json_data))
                    int.reply({
                        files: [
                            {
                                attachment: fn,
                                name: fn,
                            }
                        ]
                    }).catch(console.error).then(_ => {
                        fs.rmSync(fn)
                    })
                    return

                }, i - 1)
            }

            if (runtime_opts.get("remote", false)) {
                return { embeds: pagedEmbed.embeds, status: StatusCode.RETURN }
            }

            await pagedEmbed.begin()
            if (opts['json']) {
                return { content: Buffer.from(JSON.stringify(jsonData)).toString("base64"), status: StatusCode.RETURN }
            }
            return { noSend: true, status: StatusCode.RETURN }

        }, "Searches youtube", {
            helpArguments: {
                "search": createHelpArgument("The search query", true)
            },
            helpOptions: {
                page: createHelpOption("The page to search"),
                "list": createHelpOption(`List the results
<br>
this can be set equal to a format which will be "%l\\n" by default
%l: link
%t: title
%c: author
%d: length in seconds
%v: view count
%u: upload date
`),
                "json": createHelpOption("Send the resulting json result"),
                "thumb-quality": createHelpOption(`The quality of the thumbnail,
<br>
Valid options:
maxres
maxresdefault
sddefault
high
medium
default
start
middle
`)

            }
        })
    ]

    yield [
        'fetch-time', ccmdV2(async function({ args }) {
            let url = args[0] || "https://duckduckgo.com"
            try {
                let start = Date.now()
                await fetch(url)
                return { content: `${Date.now() - start}ms`, status: StatusCode.RETURN }
            }
            catch (err) {
                return { content: "Problem fetching ".concat(url), status: StatusCode.ERR }
            }
        }, "Gets the ping to an ip (timeout after 1.5s)", {
            helpArguments: {
                url: createHelpArgument("Url to fetch", false)
            }
        })
    ]

    yield [
        "replace", createCommandV2(async ({ args, stdin, opts }) => {
            let search = args[0]
            let repl: string = args[1]
            if (opts.getBool("n", false)) {
                repl = '\0'
            }
            else if (!repl) {
                return { content: "No replacement", status: StatusCode.ERR }
            }

            let restOfArgs = args.slice(1)
            if (repl !== '\0') {
                //remove one more time if there is a replacement
                restOfArgs = restOfArgs.slice(1)
            }

            let text: string = stdin ? getContentFromResult(stdin, "\n") : restOfArgs.join(" ")

            if (!search) {
                return { content: "no search", status: StatusCode.ERR }
            }
            if (!text) {
                return { content: "no text to search through", status: StatusCode.ERR }
            }
            let s: string | RegExp = search
            if (opts.getBool('r', false)) {
                try {
                    s = new RegExp(search, opts.getString("flags", "g"))
                }
                catch (err) {
                    return { content: `Invalid regex\n${err}`, status: StatusCode.ERR }
                }
            }
            if (repl === '\0') {
                repl = ""
            }
            return { content: text.replaceAll(s, repl || ""), status: StatusCode.RETURN }

        }, CAT, "Replaces a string with another string", {
            search: createHelpArgument("The search (1 arg)", true),
            replace: createHelpArgument("The replacement (1 arg)<br>if the -n option is given, this argument is not required", false),
            "...text": createHelpArgument("The text to search/replace through", true)
        }, {
            n: createHelpOption("No replace value"),
            r: createHelpOption("Enable regex")
        })
    ]

    yield [
        "string", ccmdV2(async ({ args, stdin }) => {
            let operation = args[0]
            let string = stdin ? getContentFromResult(stdin) : args.slice(1).join(" ")
            let operations: { [key: string]: (string: string) => string } = {
                upper: string => string.toUpperCase(),
                lower: string => string.toLowerCase(),
                title: string => string.split(" ").map(v => v[0].toUpperCase() + v.slice(1)).join(" "),
                rot13: string => rotN(string, 13),
                lc: string => String(string.split("\n").length),
                wc: string => String(string.split(" ").length),
                bc: string => String(string.split("").length),
                "utf-8c": string => String([...string].length)
            }
            if (!string) {
                return { content: "No text to manipulate", status: StatusCode.ERR }
            }
            if (!Object.keys(operations).includes(operation.toLowerCase())) {
                return { content: `${operation} is not one of: \`${Object.keys(operations).join(", ")}\``, status: StatusCode.ERR }
            }
            return { content: operations[operation.toLowerCase()](string), status: StatusCode.RETURN }
        },
            "Do something to some text",
            {
                helpArguments: {
                    operation: createHelpArgument(`The operation to do<ul>
    <li>upper:  convert to upper case</li>
    <li>lower:  convert to lowercase</li>
    <li>title:  convert to title</li>
    <li>rot13:  rot13 encode the string</li>
    <li>lc:     get a line count</li>
    <li>wc:     get a word count</li>
    <li>bc:     get a byte count</li>
    <li>utf-8c: gets a utf-8 byte count</li>
</ul>`),
                    text: createHelpArgument("The text to operate on")
                },
                accepts_stdin: "The text to manipulate (operation still required)"
            },
        ),
    ]

    yield [
        "format-seconds", createCommandV2(async ({ args }) => {
            let amountOfTime = parseFloat(args[0])
            if (isNaN(amountOfTime)) {
                return { content: `Invalid command usage\n\`[format-seconds <seconds> <format>\``, status: StatusCode.ERR }
            }
            return { content: format(args.slice(1).join(" ") || "%H:%M:%S", { H: String(Math.floor((amountOfTime / (60 * 60)) % 24)), M: String(Math.floor((amountOfTime / 60) % 60)), S: String(Math.floor(amountOfTime % 60)), d: String((Math.floor(amountOfTime / (60 * 60 * 24)) % 7)) }), status: StatusCode.RETURN }
        }, CommandCategory.UTIL, "Convert seconds into days/hours/minutes/seconds",
            {
                seconds: createHelpArgument("The amount of seconds"),
                format: createHelpArgument("The format to use<br><b>Possible formats</b><ul><li>d: The amount of days</li><li>H: The amount of hours</li><li>M: The amount of minutes</li><li>S: The amount of seconds</li></ul>", false, undefined, "%H:%M:%S")
            }
        )
    ]

    yield [
        "time", ccmdV2(async function({ args }) {
            let fmt = args.join(" ")

            const date = new Date()
            let hours = date.getHours()
            let AMPM = hours < 12 ? "AM" : "PM"
            return {
                content: fmt
                    .replaceAll("fdate", `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`)
                    .replaceAll("fulldate", `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`)
                    .replaceAll("date", `${date.getDate()}`)
                    .replaceAll("hour", `${hours}`)
                    .replaceAll("min", `${date.getMinutes()}`)
                    .replaceAll("sec", `${date.getSeconds()}`)
                    .replaceAll("time", `${hours}:${date.getMinutes()}:${date.getSeconds()}`)
                    .replaceAll("time-s", `${hours}:${date.getMinutes()}`)
                    .replaceAll("milli", `${date.getMilliseconds()}`)
                    .replaceAll("millis", `${date.getMilliseconds()}`)
                    .replaceAll("tz", `${date.getTimezoneOffset()}`)
                    .replaceAll("timezone", `${date.getTimezoneOffset()}`)
                    .replaceAll("ampm", AMPM)
                    .replaceAll("month", `${date.getMonth() + 1}`)
                    .replaceAll("year", `${date.getFullYear()}`)
                    .replaceAll("day", `${date.getDay()}`)
                    .replaceAll("unix", String(Date.now() / 1000)),
                status: StatusCode.RETURN
            }
        }, "Gets the time", {
            arguments: {
                format: {
                    description: "the format to use for the time<br><lh>formats:</lh><br><ul><li>date: the date</li><li>hour: the hour of the day</li><li>min: minute of the day</li><li>time: hours:minutes:seconds</li><li>time-s hours:minutes</li><li>millis: milliseconds</li><li>tz: timezone</li><li>ampm: am or pm</li><li>fdate: full date (monthy/day/year)</li><li>month: month of the year</li><li>year: year of the year</li><li>day: day of the year</li><li>unix: unix time</li></ul>"
                }
            }
        })
    ]

    yield [
        "rand-role", ccmdV2(async function({ msg, args }) {
            let roles = await msg.guild?.roles.fetch()
            let role = roles?.random()
            if (!role) {
                return { content: "Couldn't get random role", status: StatusCode.ERR }
            }
            let fmt = args.join(" ") || "%n"
            return { allowedMentions: { parse: [] }, content: format(fmt, { n: role.name, i: role.id, c: String(role.color), C: String(role.createdAt), hc: role.hexColor, u: String(role.unicodeEmoji), p: String(role.position), I: String(role.icon) }), status: StatusCode.ERR }
        }, "Get information on a random role", {
            arguments: {
                "...format": {
                    description: "The format to show<br><b>formats</b><ul><li>%n: the name</li><li>%i: the id</li><li>%c: the color</li><li>%C: created at</li><li>{hc}: the hex color</li><li>%u: the emoji</li><li>%p: the position number</li><li>%I: the icon</li></ul>",
                    default: "%n"
                }
            }
        })
    ]

    yield [
        "render-html", createCommandV2(async ({ args }) => {
            return { content: htmlRenderer.renderHTML(args.join(" "), 0), status: StatusCode.RETURN }
        }, CommandCategory.UTIL, "Renders <code>html</code>", {
            html: {
                description: "The html to render",
                required: true
            }
        }),
    ]

    yield [
        "htmlq",
        ccmdV2(async function({ opts, args, stdin }) {
            let query, realHTML
            if (stdin) {
                realHTML = getContentFromResult(stdin)
                query = args.join(" ")
            }
            else {
                let h;
                [query, ...h] = args.resplit("|")
                realHTML = h.join("|")
            }
            let $ = cheerio.load(realHTML)(query)
            if (opts.getBool("h", false)) {
                let innerHTML = String($.html())
                return { content: innerHTML, status: StatusCode.RETURN }
            }
            return { content: $.text(), status: StatusCode.RETURN }
        }, "Query HTML", {
            accepts_stdin: "The html to parse instead of the html after |<br>if given all arguments will count for the <b>query</b>",
            helpArguments: {
                query: createHelpArgument("The css query to query the html with", true),
                "|": createHelpArgument("A bar to seperate the query from the html", true),
                "html": createHelpArgument("Anything after the bar is the html to query", true)
            },
            helpOptions: {
                h: createHelpOption("Get the inner html instead of inner text")
            }
        })
    ]

    yield [
        "get", createCommandV2(async ({ msg, rawOpts: opts, args }) => {
            let operator = args[0]
            let object = args[1]
            let filterInfo: { type: "with" | "without" | "with!" | "without!", attribute: string, search: string } | null = null
            let filter = function(_k: any, _v: any) {
                return true
            }
            if (["with", "without", "with!"].includes(args[2])) {
                filterInfo = { type: args[2] as "with" | "without" | "without!" | "with!", attribute: args[3], search: args.slice(4).join(" ") }
                filter = function(v: any, _k: any) {
                    let search = filterInfo?.search
                    let val = v;
                    for (let attr of filterInfo?.attribute.split(".") ?? ["__BIRCLE_UNDEFINED__"]) {
                        val = val?.[attr]
                        if (val === undefined)
                            break
                    }
                    if (val !== undefined && search) {
                        return {
                            with: () => String(val).includes(search as string),
                            without: () => !String(val).includes(search as string),
                            "without!": () => String(val) !== search,
                            "with!": () => String(val) === search
                        }[filterInfo?.type as "with" | "without" | "without!" | "with!"]?.() ?? false
                    }
                    return {
                        "with": val !== undefined,
                        "with!": val !== undefined,
                        "without": val === undefined,
                        "without!": val === undefined
                    }[filterInfo?.type as "with" | "without" | "without!" | "with!"] ?? false
                }
            }
            let data: Collection<any, any> | undefined;
            let number = parseInt(String(opts['n']))
            data = await {
                "channel": async () => await msg.guild?.channels.fetch(),
                "role": async () => await msg.guild?.roles.fetch(),
                "member": async () => await msg.guild?.members.fetch(),
                "user": async () => (await msg.guild?.members.fetch())?.mapValues(v => v.user),
                "bot": async () => (await msg.guild?.members.fetch())?.filter(u => u.user.bot),
                "command": async () => new Collection<string, CommandV2>(getCommands().entries()),
                "aliasv2": async () => new Collection<string, AliasV2>(Object.entries(aliasesV2)),
                "cmd+av2": async () => new Collection<string, AliasV2 | CommandV2>(Object.entries({ ...Object.fromEntries(getCommands().entries()), ...aliasesV2 })),
            }[object as "channel" | "role" | "member" | "user" | "bot" | "command"]()
            data = data?.filter(filter)
            if (!data) {
                return { content: `${object} is invalid`, status: StatusCode.ERR }
            }
            if (data.size < 1) {
                return { content: "No results", status: StatusCode.RETURN }
            }
            switch (operator) {
                case "#": {
                    let c = number ? String(data.at(number)) : String(data.size)
                    return { content: c, allowedMentions: { parse: [] }, status: StatusCode.RETURN }
                }
                case "rand": {
                    if (object === "command") {
                        data = data.mapValues((_v, k) => k)
                    }
                    let text = ""
                    for (let i = 0; i < (number || 1); i++) {
                        text += data.random().toString() + "\n"
                    }
                    return { content: text, status: StatusCode.RETURN, allowedMentions: { parse: [] } }
                }
            }
            return { content: "Not a valid option", status: StatusCode.ERR }
        }, CommandCategory.UTIL, "gets stuff :+1:", {
            operator: createHelpArgument(`Can either be # or rand<ul><li><code>#</code>: will get a number of something</li><li><code>rand</code>: will get a random of something</li></ul>`, true),
            of: createHelpArgument("Will get either a <code>rand</code> or <code>#</code> of one of the following<ul><li>channel</li><li>role</li><li>member</li><li>user</li><li>bot</li><li>command</li><li>aliasv2</li><li>cmd+av2</li></ul>", true),
            filter: createHelpArgument(`The filter type to use, <lh>can be one of the following</lh>
<ul><li>with: checks if <code>property</code> is on the object and includes <code>search</code></li>
<li>with!: checks if <code>property</code> is on the object and equals <code>search</code></li>
<li>without: checks if <code>property</code> is not on the object, but if it is, does not include <code>search</code></li>
<li>without!: checks if <code>property</code> is not on the object, but if it is, does not include <code>search</code></li></ul>
`, false),
            property: createHelpArgument("The property to check of the object", false),
            search: createHelpArgument("Searches the property if exists", false)
        }, {
            n: createHelpOption("If <code>operator</code> is <code>#</code>, gets the n'th item<br>if <code>operator</code> is <code>rand</code>, gets n random items")
        }),
    ]

    yield [
        "paged-embed", ccmdV2(async ({ args, msg }) => {
            const embeds = []
            for (let line of args.resplit("\n")) {
                console.log(line)
                if (!line) continue
                embeds.push(JSON.parse(line))
            }
            let paged = new PagedEmbed(msg, embeds, `paged-embed:${msg.author.id}`)
            await paged.begin()
            return { noSend: true, status: StatusCode.RETURN }
        }, "Creates a paged embed to group embeds together")
    ]

    yield [
        "embed", createCommandV2(
            async ({ rawOpts: opts, args }) => {
                let embed = new EmbedBuilder()
                for (let arg of args.join(" ").split("\n")) {
                    let [type, ...typeArgs] = arg.split(" ")
                    switch (type.trim()) {
                        case "title": {
                            embed.setTitle(typeArgs.join(" "))
                            break
                        }
                        case "field": {
                            let [name, value, inline] = typeArgs.join(" ").split("|").map(v => v.trim())
                            let inlined = false
                            if (!name) {
                                name = "field"
                            }
                            if (!value)
                                value = "value"
                            if (inline === 'true')
                                inlined = true
                            embed.addFields(efd([name, value, inlined]))
                            break
                        }
                        case "color": {
                            try {
                                embed.setColor(typeArgs.join(" ") as ColorResolvable)
                            }
                            catch (err) {
                                embed.setColor("Red")
                            }
                            break
                        }
                        case "author": {
                            let [author, image] = typeArgs.join(" ").split("|").map(v => v.trim())
                            if (image)
                                embed.setAuthor({ iconURL: image, name: author })
                            else {
                                embed.setAuthor({ name: author })
                            }
                            break
                        }
                        case "image": {
                            let image = typeArgs.join(" ")
                            if (image)
                                embed.setImage(image)
                            break
                        }
                        case "thumbnail": {
                            let thumbnail = typeArgs.join(" ")
                            if (thumbnail)
                                embed.setThumbnail(thumbnail)
                            break
                        }
                        case "footer": {
                            let [text, thumbnail] = typeArgs.join(" ").split("|").map(v => v.trim())
                            if (thumbnail) {
                                embed.setFooter({ text: text, iconURL: thumbnail })
                            }
                            else {
                                embed.setFooter({ text: text })
                            }
                            break
                        }
                        case "description": {
                            let description = typeArgs.join(" ")
                            if (description)
                                embed.setDescription(description)
                            break
                        }
                        case "url": {
                            let url = typeArgs.join(" ")
                            if (url) {
                                embed.setURL(url)
                            }
                            break
                        }
                        default: {
                            continue
                        }
                    }
                }
                if (opts['json']) {
                    return { content: JSON.stringify(embed.toJSON()), status: StatusCode.RETURN }
                }
                return { embeds: [embed], status: StatusCode.RETURN }
            }, CommandCategory.UTIL,
            "Create an embed",
            {
                "instructions": createHelpArgument(`The way to create the embed, each line in the instructions should start with something to set for example:<br>
<p>
${configManager.PREFIX}embed title this is the title<br>
url https://aurl.com<br>
description the description<br>
field name | value | (optional true or false)<br>
image https://....<br>
thumbnail https://...<br>
color #00ffe2<br>
footer this is the footer | (optional link to image)<br>
author this is the author | (optional link to image)<br>
</p>
<hr>
The order these are given does not matter, excpet for field, which will be added in the order you gave`)
            },
            {
                "json": createHelpOption("Return the json that makes up the embed")
            }
        ),
    ]

    yield ["sh", createCommandV2(async ({ msg, sendCallback }) => {
        if (!isMsgChannel(msg.channel)) return { noSend: true, status: StatusCode.ERR }
        const cmd = spawn("bash")
        let dataToSend = ""
        let sendingTimeout: NodeJS.Timeout | undefined = undefined;
        function stop() {
            collector.stop()
            cmd.kill()
        }
        cmd.stdout.on("data", data => {
            dataToSend += data.toString("utf-8")

            if (sendingTimeout) clearTimeout(sendingTimeout)

            sendingTimeout = setTimeout(() => {
                handleSending(msg, { content: dataToSend, status: StatusCode.INFO }, sendCallback)
                dataToSend = ""
            }, 100)
        })
        cmd.stderr.on("data", data => {
            dataToSend += data.toString("utf-8")

            if (sendingTimeout) clearTimeout(sendingTimeout)

            sendingTimeout = setTimeout(() => {
                handleSending(msg, { content: dataToSend, status: StatusCode.INFO }, sendCallback)
                dataToSend = ""
            }, 100)
        })
        const collector = msg.channel.createMessageCollector({ filter: m => m.author.id === msg.author.id })
        const TO_INTERVAL = 30000
        let timeout = setTimeout(stop, TO_INTERVAL)
        collector.on("collect", m => {
            clearTimeout(timeout)
            timeout = setTimeout(stop, TO_INTERVAL)
            cmd.stdin.write(m.content + "\n")
        })
        return { noSend: true, status: StatusCode.ERR }
    }, CommandCategory.UTIL, "Open a remote shell", undefined, undefined, undefined, m => configManager.ADMINS.includes(m.author.id))]

    yield ["qalc", createCommandV2(async ({ msg, args: argList, opts, sendCallback }) => {
        if (!isMsgChannel(msg.channel)) return { noSend: true, status: StatusCode.ERR }
        if ((opts.getBool("repl", false) || opts.getBool("r", false) || opts.getBool("interactive", false)) && !globals.userUsingCommand(msg.author.id, "qalc")) {
            globals.startCommand(msg.author.id, "qalc")
            const cmd = spawn("qalc", argList)
            cmd.stdout.on("data", data => {
                let text = data.toString("utf-8").replaceAll(/\[[\d;]+m/g, "")
                handleSending(msg, crv(text), sendCallback)
            })
            cmd.stderr.on("data", data => {
                handleSending(msg, crv(data.toString("utf-8")), sendCallback)
            })
            cmd.on("close", () => {
                globals.endCommand(msg.author.id, "qalc")
            })
            cmd.on("exit", () => {
                if (timeout) {
                    clearTimeout(timeout)
                }
                globals.endCommand(msg.author.id, "qalc")
            })
            const collector = msg.channel.createMessageCollector({ filter: m => m.author.id === msg.author.id })
            const TO_INTERVAL = 30000
            let timeout = setTimeout(cmd.kill, TO_INTERVAL)
            collector.on("collect", m => {
                clearTimeout(timeout)
                timeout = setTimeout(cmd.kill, TO_INTERVAL)
                cmd.stdin.write(m.content + "\n")
            })
        }
        const cmd = spawnSync("qalc", ["-t"].concat(argList))
        return { content: cmd.stdout.toString("utf-8"), status: StatusCode.RETURN }
    }, CommandCategory.UTIL, "Fancy calculator")]

    yield [
        "pyjs", ccmdV2(async function({ args }) {
            let text = args.join(" ")
            let context: { [key: string]: any } = {}
            while (text) {
                let lang = text.trim().startsWith("js") ? "javascript" : "python"
                let code = parseBracketPair(text, "{}")
                text = text.slice(text.indexOf("{") + code.length + 2)
                let resultKey = 'SAFE_EVAL_' + Math.floor(Math.random() * 1000000)
                context[resultKey] = {}
                if (lang === "javascript") {
                    context["Buffer"] = Buffer
                    let clearContext = `
            Function = undefined;
            require = undefined;
            WebAssembly.constructor = undefined;
            fetch = undefined;
            `
                    //let clearContext = 'Function = undefined;'
                    code = clearContext + resultKey + '=' + code
                    vm.runInNewContext(code, context, {})
                }
                else {
                    code = `math = __import__('math')
random = __import__('random')
if(hasattr(random, "_os")):
    del random._os
if(hasattr(random, "os")):
    del random.os
__import__ = None

null = None
context = ${JSON.stringify(context)}
for key in context:
    globals()[key] = context[key]
del context
eval("""${code.trim()}""")
import json
print(json.dumps({k: v for k, v in filter(lambda x: isinstance(x[1], str | int | float | list | dict), globals().items())}))`
                    let moreDat = spawnSync("python3", ["-c", code], {
                        timeout: 3000
                    })
                    let sendText = ""
                    if (moreDat.stderr.toString("utf-8")) {
                        sendText += moreDat.stderr.toString("utf-8").trim() + '\n'
                    }
                    if (moreDat.stdout.toString("utf-8")) {
                        sendText += moreDat.stdout.toString("utf-8").trim()
                    }
                    context = JSON.parse(sendText)
                }
            }
            return crv(String(context["rv"]) ?? "You must set the rv variable to the result")
        }, "Write js/python code", {
            docs: "All variables are accessible between languages<br>the final result of your code should be in the <code>rv</code> variable<br>Example<br><code>js { x = 3 } python { (rv := x * 10) }</code>"
        })
    ]

    yield [
        "calc", ccmdV2(async function({ rawOpts: opts, args, msg }) {
            let sep = opts['sep']
            if (!sep) {
                sep = "\n"
            } else sep = String(sep)
            let stringifyFn = opts['pretty'] || opts['p'] ? prettyJSON : JSON.stringify
            if (opts['s']) {
                stringifyFn = String
            }
            if (opts['python']) {
                let codeStr = `math = __import__('math')
random = __import__('random')
if(hasattr(random, "_os")):
    del random._os
if(hasattr(random, "os")):
    del random.os
__import__ = None
class VarHolder:
    def __init__(self, dict):
        self.__dict__ = dict
    def __repr__(self):
        return repr(self.__dict__)
null = None
g = VarHolder(${JSON.stringify(vars.vars['__global__'])})
u = VarHolder(${JSON.stringify(vars.vars[msg.author.id]) || "{}"})
print(eval("""${args.join(" ").replaceAll('"', "'")}"""))`
                let moreDat = spawnSync("python3", ["-c", codeStr], {
                    timeout: 3000
                })
                let sendText = ""
                if (moreDat.stderr.toString("utf-8")) {
                    sendText += moreDat.stderr.toString("utf-8").trim() + '\n'
                }
                if (moreDat.stdout.toString("utf-8")) {
                    sendText += moreDat.stdout.toString("utf-8").trim()
                }
                return { content: sendText, status: StatusCode.RETURN }
            }
            let ret: string = ""
            try {
                ret = stringifyFn(safeEval(args.join(" "), { args: args, lastCommand: lastCommand[msg.author.id], g: vars.vars["__global__"], u: vars.vars[msg.author.id], ...generateDefaultRecurseBans() || {} }, { timeout: 3000 }))
            }
            catch (err) {
                console.log(err)
            }
            return { content: ret, status: StatusCode.RETURN }
        }, "Run a calculation", {
            arguments: {
                "...equations": {
                    description: "The equation(s) to evaluate<br>Seperate each equation with a new line"
                }
            },
            options: {
                sep: {
                    description: "If multiple equations are given, this seperates each answer"
                },
                p: createHelpOption("prettify the json output")
            }
        })
    ]

    yield [
        "format-json", ccmdV2(async function({ msg, args, stdin, opts }) {
            let text = stdin ? getContentFromResult(stdin) : args.join(" ")
            if (!text) {
                let file = await getImgFromMsgAndOptsAndReply(opts, msg, stdin)
                if (!file) {
                    return crv("No text, or file given", { status: StatusCode.ERR })
                }
                let req = await fetch(file)
                text = await req.text()
            }
            let json
            try {
                json = JSON.parse(text)
            }
            catch (e) {
                return crv("Not a valid json", { status: StatusCode.ERR })
            }
            return crv(prettyJSON(json))
        }, "Format the json")
    ]

    yield [
        "read-lines", ccmdV2(async function*({ args, stdin, opts }) {
            let text = stdin ? getContentFromResult(stdin) : args.join(" ")
            let lines = text.trim().split("\n")
            for (let line of lines) {
                yield crv(line)
            }
            return { noSend: true, status: StatusCode.RETURN }
        }, "Read each line one at a time and send to sendCallback", {
            accepts_stdin: "The text to read one line at a time"
        })
    ]

    yield [
        "pcount", ccmdV2(async function({ args }) {
            let id = args[0]
            if (!id) {
                return { status: StatusCode.ERR, content: "no id given" }
            }
            let str = ""
            for (let key in globals.POLLS[`poll:${id}`]) {
                str += `${key}: ${globals.POLLS[`poll:${id}`]["votes"][key].length}\n`
            }
            return { content: str, status: StatusCode.RETURN }
        }, "Gets the id of a poll", {
            arguments: {
                "id": {
                    description: "The id of the poll to get the count of"
                }
            }
        })
    ]

    yield [
        "rand", createCommandV2(async ({ opts, args }) => {
            const low = parseFloat(args[0]) || 0
            const high: number = parseFloat(args[1]) || 100
            const count = parseInt(args[2]) || 1
            if (count > 50000) {
                return { content: "Too many numbers", status: StatusCode.ERR }
            }
            let answers = []
            for (let i = 0; i < count; i++) {
                let ans = Math.random() * (high - low) + low
                if (opts.getBool("round", false)) {
                    ans = Math.floor(ans)
                }
                answers.push(ans)
            }
            return {
                content: answers.join(String(opts.getString("s", ", "))),
                status: StatusCode.RETURN
            }
        }, CommandCategory.UTIL, "Generate random number", {
            low: createHelpArgument("The lowest number", false, undefined, "0"),
            high: createHelpArgument("The highest number", false, undefined, "100"),
            count: createHelpArgument("The amount to generate", false)
        }, {
            round: createHelpOption("Round the number"),
            s: createHelpOption("The seperator to seperate each number with")
        })]

    yield [
        "roles", ccmdV2(async function({ msg, args }) {
            if (!msg.guild) return crv("Not in a guild", { status: StatusCode.ERR })
            let users = []
            for (let arg of args) {
                users.push(await fetchUser(msg.guild, arg))
            }
            if (users.length == 0) {
                users.push(await fetchUser(msg.guild, msg.author.id))
            }
            let embeds = []
            for (let user of users) {
                let roles = user?.roles
                if (!roles) {
                    return {
                        content: "Could not find roles",
                        status: StatusCode.ERR
                    }
                }
                let embed = new EmbedBuilder()
                embed.setTitle(`Roles for: ${user?.user.username}`)
                embed.addFields(efd(["Role count", String(roles.cache.size)]))
                let text = roles.cache.toJSON().join(" ")
                let backup_text = roles.cache.map(v => v.name).join(" ")
                if (text.length <= 1024) {
                    embed.addFields(efd(["Roles", roles.cache.toJSON().join(" ")]))
                }
                else if (backup_text.length <= 1024) {
                    embed.addFields(efd(["Roles", backup_text]))
                }
                else {
                    embed.addFields(efd(["Roles", "Too many to list"]))
                }
                embeds.push(embed)
            }
            return {
                embeds: embeds,
                status: StatusCode.RETURN
            }
        }, "Gets the roles of a user", {
            arguments: {
                "user": createHelpArgument("The user to get the roles of", true)
            }
        })
    ]

    yield [
        "search-cmd-file", ccmdV2(async function({ rawOpts: opts, args }) {
            let file = args[0]
            let search = args.slice(1).join(" ")
            if (!file) {
                return { content: "No file specified", status: StatusCode.ERR }
            }
            if (file.match(/\./)) {
                return { content: "<:Watching1:697677860336304178>", status: StatusCode.ERR }
            }
            if (!fs.existsSync(`./command-results/${file}`)) {
                return {
                    content: "file does not exist",
                    status: StatusCode.ERR
                }
            }
            const text = fs.readFileSync(`./command-results/${file}`, "utf-8")
            let lines = text.split(";END")
            if (opts['arg']) {
                let argNo = Number(opts['args'])
                if (isNaN(argNo)) {
                    argNo = 1
                }
                lines = lines.map(v => v.split(" ")[argNo])
            }
            let final = []
            for (let i = 0; i < lines.length; i++) {
                let line = lines[i]
                try {
                    if (line.match(search)) {
                        final.push(`${i + 1}: ${line}`)
                    }
                }
                catch (err) {
                    return { content: "Invalid regex", status: StatusCode.ERR }
                }
            }
            return { content: final.join("\n"), status: StatusCode.RETURN }
        }, "Searches a command file", {
            arguments: {
                file: createHelpArgument("The file to search", true),
                "...search": createHelpArgument("The regex to search for in the file", true)
            }
        })
    ]

    yield [
        "comp-roles", ccmdV2(async function({ msg, args }) {
            if (!msg.guild) return crv("Not in a guild", { status: StatusCode.ERR })
            let [user1, user2] = args.join(" ").split("|")
            user1 = user1.trim()
            user2 = user2.trim()
            if (!user1) {
                return { content: "No users given", status: StatusCode.ERR }
            }
            if (!user2) {
                return { content: "2 users must be given", status: StatusCode.ERR }
            }
            let realUser1 = await fetchUser(msg.guild, user1)
            if (!realUser1) {
                return { content: `${user1} not found`, status: StatusCode.ERR }
            }
            let realUser2 = await fetchUser(msg.guild, user2)
            if (!realUser2) {
                return { content: `${user2} not found`, status: StatusCode.ERR }
            }
            let user1Roles = realUser1.roles.cache.toJSON()
            let user2Roles = realUser2.roles.cache.toJSON()
            let user1RoleIds = user1Roles.map(v => v.id)
            let user2RoleIds = user2Roles.map(v => v.id)
            let sameRoles = user1Roles.filter(v => user2RoleIds.includes(v.id))
            let user1Unique = user1Roles.filter(v => !user2RoleIds.includes(v.id))
            let user2Unique = user2Roles.filter(v => !user1RoleIds.includes(v.id))
            let embed = new EmbedBuilder()
            let same = sameRoles.reduce((prev, cur) => `${prev} ${cur}`, "")
            let user1U = user1Unique.reduce((prev, cur) => `${prev} ${cur}`, "")
            let user2U = user2Unique.reduce((prev, cur) => `${prev} ${cur}`, "")
            let u1Net = user1RoleIds.length - user2RoleIds.length
            embed.setTitle("roles")
            if (u1Net > 0) {
                embed.setDescription(`${realUser1.displayName} has ${u1Net} more roles than ${realUser2.displayName}`)
            }
            else if (u1Net < 0) {
                embed.setDescription(`${realUser1.displayName} has ${-u1Net} less roles than ${realUser2.displayName}`)
            }
            else {
                embed.setDescription(`${realUser1.displayName} has the same amount of roles as ${realUser2.displayName}`)
            }
            embed.addFields(efd(["Same Roles", same || "No same"], [`${realUser1.displayName} unique roles`, user1U || "No unique roles"], [`${realUser2.displayName} unique roles`, user2U || "No unique roles"]))
            return { embeds: [embed], status: StatusCode.RETURN, allowedMentions: { parse: [] } }
        }, "Compare 2 user's roles", {
            arguments: {
                user1: {
                    description: "The first user",
                },
                "|": {
                    description: "Seperates the users",
                },
                user2: {
                    description: "The second user"
                }
            }
        })
    ]

    yield [
        "most-roles", ccmdV2(async function({ rawOpts: opts, msg, args }) {
            let times = parseInt(args[0]) || 10
            await msg.guild?.members.fetch()
            let sortedMembers = msg.guild?.members.cache.sorted((ua, ub) => ub.roles.cache.size - ua.roles.cache.size)
            let embed = new EmbedBuilder()
            embed.setTitle(`${sortedMembers?.at(0)?.user.username} has the most roles`)
            if (sortedMembers?.at(0)?.displayColor) {
                embed.setColor(sortedMembers?.at(0)?.displayColor || "Red")
            }
            let ret = ""
            for (let i = 0; i < times; i++) {
                let member = sortedMembers?.at(i)
                ret += `${i + 1}: ${member}: ${member?.roles.cache.size}\n`
                embed.addFields(efd([String(i + 1), `**${member}**\n${member?.roles.cache.size}`, true]))
            }
            let rv: CommandReturn = { allowedMentions: { parse: [] }, status: StatusCode.RETURN }
            if (!opts['E'] && !opts['c!'])
                rv.embeds = [embed]
            if (opts['c'] || opts['c!']) {
                rv.content = ret
            }
            return rv
        }, "Display a list of users with the most roles", {
            arguments: {
                top: {
                    description: "The top x users to display",
                    required: false,
                }
            },
            options: {
                E: {
                    description: "Don't display an embed"
                },
                c: {
                    description: "Display the results as a list"
                },
                "c!": {
                    description: "Display the results as a list instead of an embed"
                }
            }
        }),
    ]

    yield [
        "whohas", createCommandV2(async ({ msg, args: argList }) => {
            argList.beginIter()
            let realRole = await argList.expectRole(msg.guild as Guild, truthy) as Role | typeof BADVALUE
            if (realRole === BADVALUE) {
                return {
                    content: "Could not find role",
                    status: StatusCode.ERR
                }
            }
            await msg.guild?.members.fetch()
            let memberTexts = [""]
            let embed = new EmbedBuilder()
            embed.setTitle(realRole.name)
            let i = 0
            let memberCount = 0
            for (let member of realRole.members) {
                memberTexts[i] += `<@${member[1].id}> `
                memberCount += 1
                if (memberTexts[i].length > 1000) {
                    embed.addFields(efd([`members`, memberTexts[i]]))
                    i++
                    memberTexts.push("")
                }
            }
            if (!memberTexts[0].length) {
                return { content: "No one", status: StatusCode.RETURN }
            }
            if ((embed.data.fields?.length || 0) < 1) {
                embed.addFields(efd([`members: ${i}`, memberTexts[i]]))
            }
            embed.addFields(efd(["Member count", String(memberCount)]))
            return { embeds: [embed], status: StatusCode.RETURN, allowedMentions: { parse: [] } }

        }, CAT, "Gets a list of users with a specific role", {
            "...role": createHelpArgument("The role to search for")
        })
    ]

    yield ["printf", createCommandV2(async ({ args: argList, opts, msg }) => {
        class Format {
            /**
            * @abstract
            */
            async format(text: string): Promise<string> { return text }

            static parseFormatSpecifier(format: string): Format | string {
                if (!format.startsWith("%")) {
                    return format
                }
                format = format.slice(1)
                let dataType = format.slice(-1)
                switch (dataType) {
                    case "f":
                    case "x":
                    case "X":
                    case "o":
                    case "d":
                        return NumberFormat.parseFormatSpecifier(format)
                    case "s":
                        return StringFormat.parseFormatSpecifier(format)
                    case "u":
                        return UserFormat.parseFormatSpecifier(format)
                    case "c":
                        return CommandFormat.parseFormatSpecifier(format)
                    case "%":
                        return "%"
                    default:
                        return format
                }
            }
        }

        class CommandFormat extends Format {
            showType: "$" | "-" | "#" | "?" | "0" | "()"
            joinChar: string
            constructor(showType: "$" | "-" | "#" | "?" | "0" | "()", joinChar?: string) {
                super()
                this.showType = showType
                this.joinChar = joinChar ?? " "
            }
            async format(text: string) {
                let cmds = { ...Object.fromEntries(getCommands().entries()), ...getMatchCommands(), ...getAliasesV2() }
                let cmd = cmds[text]
                if (!cmd) {
                    return text
                }
                switch (this.showType) {
                    case "0":
                        return text
                    case "$":
                        return Object.keys(cmd?.help?.arguments || []).join(this.joinChar)
                    case "-":
                        return Object.keys(cmd?.help?.options || []).join(this.joinChar)
                    case "#":
                        return cmd?.help?.tags?.join(this.joinChar) || ""
                    case "?":
                        return generateCommandSummary(text, cmd)
                    case "()":
                        return String(cmd.run)
                    default:
                        if (!cmd?.help?.info) {
                            return text
                        }
                        return htmlRenderer.renderHTML(cmd.help?.info as string)
                }
            }
            static parseFormatSpecifier(format: string): string | Format {
                let [char, ...rest] = format
                let showType = char
                if (rest[0] === ')') {
                    showType += rest[0]
                    rest = rest.slice(1)
                }
                return new CommandFormat(showType as "$" | "-" | "#" | "?" | "0" | "()")
            }
        }

        class UserFormat extends Format {
            constructor(private showType: string) {
                super()
            }
            async format(text: string) {
                let user = await fetchUser(msg.guild as Guild, text)
                if (!user) {
                    return text
                }
                if (this.showType === "@")
                    return `<@${user.id}>`
                else if (this.showType === "#") {
                    return user.displayHexColor || "NONE"
                }
                else if (this.showType === "a") {
                    return user.displayAvatarURL() ?? "NONE"
                }
                return text
            }
            static parseFormatSpecifier(format: string): string | Format {
                return new UserFormat(format[0])
            }
        }

        class StringFormat extends Format {
            lPadding: number
            constructor(lPadding: number) {
                super()
                this.lPadding = lPadding
            }
            async format(text: string) {
                let newText = text
                if (text.length < this.lPadding) {
                    newText = text + " ".repeat(this.lPadding - text.length)
                }
                return newText
            }
            static parseFormatSpecifier(format: string): StringFormat | string {
                let lpad = 0
                let lpadstr = ""
                if (format[0] === '-') {
                    let i = -0
                    let char;
                    while (!isNaN(Number(char = format[++i]))) {
                        lpadstr += char

                    }
                    lpad = Number(lpadstr)
                }
                return new StringFormat(lpad)
            }
        }

        type NumberType = "base10" | "x" | "o" | "X" | "d" | "f"

        class NumberFormat extends Format {
            numLength: number
            type: NumberType
            addCommas: boolean
            decimalCount: number
            constructor(numLength?: number, type?: NumberType, addCommas?: boolean, decimalCount?: number) {
                super()
                this.numLength = numLength ?? 1
                this.type = type ?? "base10"
                this.addCommas = addCommas ?? false
                this.decimalCount = decimalCount ?? (this.type === "f" ? 2 : 0)
            }
            _formatBase(num: number, base: number) {
                let nS = num.toString(base)
                let [numberBit, decBit] = nS.split(".")
                if (this.addCommas) {
                    numberBit = [...numberBit].reverse().join("").replace(/(...)/g, "$1,").split("").reverse().join("")
                    if (numberBit.startsWith(",")) numberBit = numberBit.slice(1)
                }
                if (numberBit.length < this.numLength) {
                    numberBit = "0".repeat(this.numLength - numberBit.length) + numberBit
                }
                if (this.decimalCount) {
                    if (!decBit) {
                        decBit = "0".repeat(this.decimalCount)
                    }
                    else if (decBit.length < this.decimalCount) {
                        decBit += "0".repeat(this.decimalCount - decBit.length)
                    }
                    else if (decBit.length > this.decimalCount) {
                        decBit = decBit.slice(0, this.decimalCount)
                    }
                }
                if (decBit)
                    nS = `${numberBit}.${decBit}`
                else nS = numberBit
                return nS;
            }
            async format(text: string) {
                let num = Number(text)
                if (isNaN(num)) {
                    let text = "0".repeat(this.numLength)
                    if (this.decimalCount) {
                        text += `.${"0".repeat(this.decimalCount)}`
                    }
                    return text
                }
                let fn = this._formatBase.bind(this, num)
                switch (this.type) {
                    case "x": {
                        return fn(16);
                    }
                    case "X": {
                        return fn(16).toUpperCase()
                    }
                    case "o": {
                        return fn(8);
                    }
                    case "f":
                    case "d":
                    case 'base10': {
                        return fn(10)
                    }
                }
            }

            static parseFormatSpecifier(format: string): string | NumberFormat {
                let base = format.slice(-1) as "x" | "X" | "o" | "d"
                format = format.slice(0, -1)
                let digits;
                let paddingCount = 0;
                let decPaddingCount = 0;
                let addCommas = false
                if (format[0] === "0" && (digits = format.slice(1)?.match(/^[0-9]+/))) {
                    paddingCount = Number(format.slice(1, digits[0].length + 1))
                    format = format.slice(1 + digits[0].length)
                }
                if (format[0] === "." && (digits = format.slice(1)?.match(/^[0-9]+/))) {
                    decPaddingCount = Number(format.slice(1, digits[0].length + 1))
                    format = format.slice(1 + digits[0].length)
                }
                if (format[0] === "'") {
                    addCommas = true
                }
                return new NumberFormat(paddingCount, base, addCommas, decPaddingCount)
            }
        }
        let formatSpecifierList: (string | Format)[] = []
        argList.beginIter()
        let formatSpecifier = argList.expectString(1)
        if (formatSpecifier === BADVALUE) {
            return { content: "No specifier given", status: StatusCode.ERR }
        }
        let currentSpecifier = ""
        for (let char of formatSpecifier) {
            //%a is reserved for %au
            if ("sdXxofuc".includes(char)) {
                formatSpecifierList.push(Format.parseFormatSpecifier(currentSpecifier + char))
                currentSpecifier = ""
                continue;
            }
            if ("%".includes(char) && currentSpecifier) {
                formatSpecifierList.push(Format.parseFormatSpecifier(currentSpecifier))
                currentSpecifier = ""
            }
            currentSpecifier += char
        }
        if (currentSpecifier) {
            formatSpecifierList.push(Format.parseFormatSpecifier(currentSpecifier))
        }

        let rv: CommandReturn = { status: StatusCode.RETURN, allowedMentions: { parse: [] } }

        let sendToVar: string | boolean = false

        if (opts.getBool("d", false)) {
            rv.delete = true
        }
        if (opts.getBool("dm", false)) {
            if (msg.author.dmChannel)
                rv.channel = msg.author.dmChannel
        }
        if (sendToVar = opts.getString("v", "")) {
            rv.noSend = true
        }

        if (formatSpecifierList.filter(v => typeof v === 'string').length === formatSpecifierList.length) {
            rv.content = formatSpecifierList.join("")
            if (sendToVar) {
                vars.setVarEasy(sendToVar, rv.content, msg.author.id)
            }
            return rv
        }

        let text = ""
        let argNo = 1
        //while there are arguments provided
        while (argNo < argList.length) {
            //go through each format specifier
            for (let i = 0; i < formatSpecifierList.length; i++) {
                let currentSpec = formatSpecifierList[i]
                if (typeof currentSpec === 'string') {
                    text += currentSpec
                }
                else {
                    //when an arg is needed move to the next arg
                    text += await currentSpec.format(argList[argNo++])
                }
            }
        }
        rv.content = text
        if (sendToVar) {
            vars.setVarEasy(sendToVar, rv.content, msg.author.id)
        }
        return rv
    }, CAT, "Similar to echo", {
        specifier: createHelpArgument("The format specifier<br>%[fmt]<s|d|x|X|o|f|u><br><ul><li>fmt: special information depending on which type to use</li></ul><lh>types</lh><ul><li>[-leftpad]s: string</li><li>d,x,X,o,f: fmt is in the form of [0<count>][.<count>][']<br>0: to specify how many leading 0s<br>.: to specify the decimal place count<br>': to add commas<br>d: base 10, xX: base 16, o: base 8</li><li>u: format a user mention</li><li>c: command format</li></ul>", true),
        "...data": createHelpArgument("The data to fill the specifier with")
    })]

    yield [
        "pollify", ccmdV2(async function({ rawOpts: opts, msg, args, sendCallback }) {
            if (msg.deletable && opts['d']) await msg.delete()
            let message = await handleSending(msg, { content: args.join(" ") || "poll", status: StatusCode.RETURN }, sendCallback)
            await message.react("<:Blue_check:608847324269248512>")
            await message.react("<:neutral:716078457880051734>")
            await message.react("❌")
            return { noSend: true, status: StatusCode.INFO }
        }, "Idk it pollifies what do you want", {
        })
    ]

    yield ["stackl2", ccmdV2(async function({ args }) {
        const res = stackl2.run(args.join(" ").replace(/^```/, "").replace(/```$/, ""))
        return crv(String(res.map(v => v[0]).join("\n")))
    }, "stackl2")]

    yield [
        'stackl', ccmdV2(async function({ rawOpts: opts, msg, args }) {
            const stackl = await import("../stackl")
            let useStart = true
            if (opts['no-start'] === true) {
                useStart = false
            }
            if (opts['docs'] === true) {
                console.log('hi')
                return {
                    files: [
                        {
                            name: "stackl.txt",
                            description: "The stackl documentation",
                            delete: false,
                            attachment: "./data/stackl.norg"
                        }
                    ],
                    status: StatusCode.RETURN
                }
            }

            let stack = await stackl.parse(args, useStart, msg)
            if (stack?.err) {
                return { content: stack.content, status: StatusCode.RETURN }
            }

            let embeds = []
            let texts = []

            type stackTypes = number | string | Message | GuildMember | Function | Array<stackTypes> | EmbedBuilder
            for (let item of stack as Array<stackTypes>) {
                if (item instanceof EmbedBuilder) {
                    embeds.push(item)
                }
                else {
                    texts.push(item)
                }
            }
            return { content: texts.join(String(opts['join'] ?? " ")), embeds: embeds, noSend: (<Array<stackTypes>>stack).length > 0 ? false : true, status: StatusCode.RETURN }

        }, "Welcome to stackl", {
            arguments: {
                code: {
                    description: "The code to run"
                }
            },
            options: {
                "no-start": {
                    description: "Remove the need for %start"
                },
                "docs": {
                    description: "Post the documentation"
                }
            }
        })
    ]

    yield [
        "expr", ccmdV2(async function({ rawOpts: opts, msg, args, symbols }) {

            let prefix = ""
            let isEnv = false
            if (opts['u']) {
                prefix = msg.author.id
            }

            if (opts['e']) {
                isEnv = true
            }

            let left = args[0]

            let convFn = opts['s'] ? String : Number

            let isBad = opts['s'] ? (s: string) => s ? false : true : isNaN

            let leftVal = convFn(left)
            if (isBad(leftVal)) {
                if (!isEnv)
                    leftVal = convFn(vars.getVar(msg, `${prefix}:${left}`))
                else leftVal = convFn(symbols.get(left))
            }
            if (isBad(leftVal)) {
                return crv(`${left} did not pass the ${convFn.name} check`, { status: StatusCode.ERR })
            }

            let op = args[1]

            let right = args[2]

            let rightVal = convFn(right)
            if (right && isBad(rightVal)) {
                if (!isEnv)
                    rightVal = convFn(vars.getVar(msg, `${prefix}:${right}`))
                else rightVal = convFn(symbols.get(right))
            }
            if (right && isBad(rightVal)) {
                return crv(`${right} is not a number`, { status: StatusCode.ERR })
            }

            let ans: any
            switch (op) {
                case "++":
                    ans = typeof leftVal === 'string' ? leftVal.repeat(2) : leftVal + 1
                    break
                case "--":
                    if (typeof leftVal === 'string') {
                        ans = NaN
                    }
                    else ans = leftVal - 1
                    break
                case "floor":
                    ans = typeof leftVal === 'string' ? NaN : Math.floor(leftVal)
                    break;
                case "ceil":
                    ans = typeof leftVal === 'string' ? NaN : Math.ceil(leftVal)
                    break;
                case ",":
                    ans = ""
                    for (let i = 0; i < String(leftVal).length; i++) {
                        if (i % 3 == 0 && i != 0) {
                            ans += ","
                        }
                        ans += left[left.length - i - 1]
                    }
                    let newAns = ""
                    for (let i = ans.length - 1; i >= 0; i--) {
                        newAns += ans[i]
                    }
                    ans = newAns
                    break;
                case "+":
                    ans = (leftVal as string) + rightVal
                    break
                case "-":
                    if (typeof leftVal === 'string' && typeof rightVal === 'string') {
                        ans = leftVal.replaceAll(rightVal, "")
                    }
                    else if (typeof leftVal === 'number' && typeof rightVal == 'number') ans = leftVal - rightVal
                    break
                case "*":
                    if (!isNaN(Number(rightVal)) && typeof leftVal === 'string') {
                        ans = leftVal.repeat(Number(rightVal))
                    }
                    else if (typeof leftVal === 'number' && typeof rightVal === 'number')
                        ans = leftVal * rightVal
                    break
                case "/":
                    if (typeof leftVal === 'string' || typeof rightVal === 'string') ans = NaN
                    else ans = leftVal / rightVal
                    break
                case "^":
                    if (typeof leftVal === 'string' || typeof rightVal === 'string') ans = NaN
                    else ans = leftVal ^ rightVal
                    break;
                case "%":
                    if (typeof leftVal === 'string' || typeof rightVal === 'string') ans = NaN
                    else ans = leftVal % rightVal
                    break;
            }
            if (!isEnv) {
                if (prefix === msg.author.id) prefix = "%"
                vars.setVarEasy(`${prefix}:${left}`, String(ans), msg.author.id)
            } else {
                symbols.set(left, String(ans))
            }
            return { content: String(ans), status: StatusCode.RETURN }
        }, "Modify a variable", {
            arguments: {
                "num1": {
                    description: "Number 1 (can be a variable)"
                },
                "operator": {
                    description: "The operator<ul><li>++</li><li>--</li><li>floor</li><li>ceil</li><li>,</li><li>:</li><li>+</li><li>-</li><li>*</li><li>/</li><li>^</li><li>%</li></ul>"
                },
                "num2": {
                    description: "The other number (can be a variable)"
                }
            },
            options: {
                s: createHelpOption("Treat each value as a string, and do not do variable lookup"),
                u: createHelpOption("Treat each word as a user variable")
            }
        }),
    ]

    yield [
        "cut", ccmdV2(async function({ args, opts, stdin }) {
            let fields = opts.getString("f", opts.getString("fields", "1-"))
            let delimiter = opts.getString("d", opts.getString("delimiter", " "))
            let join = opts.getString("j", opts.getString("join", "\t"))
            let text = stdin ? getContentFromResult(stdin, "\n") : args.join(delimiter)
            let numberField = Number(fields)
            let [start, end] = fields.split("-")
            let [startN, endN] = [Number(start || NaN), Number(end || NaN)]
            let rows = Array.from(text.split("\n"), (i) => i.split(delimiter))
            if (!isNaN(numberField)) {
                return crv(rows.map(v => v[numberField - 1]).join("\n"))
            }

            if (isNaN(startN)) {
                startN = 1
            }
            if (isNaN(endN)) {
                return crv(rows.map(v => v.slice(startN - 1).join(join)).join("\n"))
            }
            return crv(rows.map(v => v.slice(startN - 1, endN).join(join)).join("\n"))

        }, "Cuts a string my seperator, and says the requested fields", {
            helpArguments: {
                "...text": createHelpArgument("The text to cut", false)
            },
            helpOptions: {
                "d": createHelpOption("The delimiter", ["delimiter"], "<space>", true),
                f: createHelpOption("The fields to get in the format of <code>start[-[end]]</code>", ["fields"], "1-", true),
                j: createHelpOption("The text to join the fields by", ["join"], "\\t", true)
            },
            accepts_stdin: "Can be used instead of <code>...text</code>",
            gen_opts: true
        })
    ]

    yield [
        "file", ccmdV2(async ({ msg, opts, args, stdin }) => {
            let fn = generateFileName("file", msg.author.id, mimeTypeToFileExtension(opts.getString("mime", stdin?.mimetype || "plain/text") as MimeType))
            fs.writeFileSync(fn, stdin ? getContentFromResult(stdin, "\n") : args.join(" "))

            return {
                files: [
                    {
                        attachment: fn,
                        name: fn,
                        description: `data`,
                    }
                ],
                status: StatusCode.RETURN
            }

        }, "Creates a file with data", {
            options: {
                mime: createHelpOption("The mimetype of the file", undefined, "plain/text")
            }
        })
    ]

    yield [
        "b64m", createCommandV2(async ({ args }) => {
            let table: { [key: number]: string } = {}
            let j = 0;
            for (let char of "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/") {
                table[j++] = char;
            }
            let encoded = ""
            let binnumber = ""
            for (let char of args.join(" ")) {
                let n = `${char.codePointAt(0)?.toString(2)}`
                if (n.length < 8) {
                    n = mulStr("0", 8 - n.length) + n
                }
                binnumber += n
            }
            let i;
            for (i = 0; i < binnumber.length - 6; i += 6) {
                let binrep = binnumber.slice(i, i + 6)
                encoded += String(table[Number(`0b${binrep}`)])
            }
            let lastBits = binnumber.slice(i)
            lastBits += (() => {
                let x = ""
                for (let i = 0; i < 6 - lastBits.length; i++) {
                    x += "0"
                }
                return x
            })()
            encoded += String(table[Number(`0b${lastBits}`)])


            return { content: encoded, status: StatusCode.RETURN }
        }, CommandCategory.UTIL, "Custom implementation of b64, only works on ascii"),
    ]

    yield [
        "b64", createCommandV2(async ({ args, stdin, opts }) => {
            let text = stdin ? getContentFromResult(stdin, "\n") : args.join(" ")
            let content = opts.getBool("d", false)
                ? Buffer.from(text, "base64").toString("utf8")
                : Buffer.from(text).toString("base64")
            return { content, status: StatusCode.RETURN }
        }, CAT, "Encodes text to base64")
    ]

    yield [
        "b64d", createCommandV2(async function({ stdin, args }) {
            let text = stdin ? getContentFromResult(stdin, "\n") : args.join(" ")
            return crv(Buffer.from(text, "base64").toString("utf8"))
        }, CommandCategory.UTIL, "Decodes base64 (use b64 -d instead)")
    ]

    yield [
        "verify-counting", ccmdV2(async function*({ msg, args }) {
            const channelId = configManager.BOT_CONFIG.general['counting-channel']
            const channel = await msg.guild?.channels.fetch(channelId)
            if (!channel || !channel.isTextBased()) {
                return crv("Could not find the counting channel", {
                    status: StatusCode.ERR
                })
            }
            let curMsg = (await channel.messages.fetch({ limit: 1 })).at(0)?.id as string
            let n = 0
            let messageCount = 0
            while (true) {
                let messages = await channel.messages.fetch({ before: curMsg, limit: 100 })
                if (!messages.size)
                    break
                const messageList = messages.values().toArray()
                messageCount += messageList.length
                for(let i = 0; i < messageList.length; i++) {
                    const m = messageList[i]
                    if(!m.content && !m.embeds.length) {
                        yield { content: `${m.url} is likely correct, ignoring`, status: StatusCode.INFO }
                        n--
                        continue
                    }
                    let number = parseInt(m.content.replaceAll(".", ""))
                    if(m.embeds.length) {
                        number = parseInt(m.embeds[0].title!.replaceAll(".", ""))
                    }
                    if(n !== 0 && number !== n - 1) {
                        yield { status: StatusCode.INFO, content: `${m.url} should be ${n - 1}` }
                    }
                    n = number
                }

                await sleep(Math.random() * 3000)
                curMsg = messageList[messageList.length - 1].id
                console.log(n, messageCount)
            }
            return crv(`done, ${messageCount} messages total`)
        }, "verifies all numbers in the counting channel")
    ]

    yield [
        "archive-channel",
        ccmdV2(async function*({ msg, args }) {
            if (!msg.guild) {
                return crv("Must be in a guild", { status: StatusCode.ERR })
            }
            let channel = await fetchChannel(msg.guild, args[0] || msg.channel.id) || msg.channel
            if (!("messages" in channel)) {
                return crv(`${channel} is not a message channel`, { status: StatusCode.ERR })
            }
            let curMsg = msg.reference?.messageId || (await channel.messages.fetch({ limit: 1 })).at(0)?.id as string
            if (!curMsg) {
                return crv("Could not get latest message", { status: StatusCode.ERR })
            }
            let fn = generateFileName("archive-channel", `${msg.author.id}-${channel.id}`, "txt")
            let stream = fs.createWriteStream(fn, "utf8")
            let mesageCount = 0
            while (true) {
                let messages = await channel.messages.fetch({ before: curMsg, limit: 100 })
                mesageCount += messages.size
                if (!messages.size)
                    break
                let text = ""
                let msgList = messages.toJSON()
                for (let message of msgList) {
                    text += `(${new Date(message.createdTimestamp)}) @${message.author.username}: ${message.content}\n`
                }
                stream.write(text)

                yield crv(`${mesageCount} messages have been archived`)

                await sleep(Math.random() * 3000)

                curMsg = msgList[msgList.length - 1].id
            }

            stream.end()

            return {
                files: [
                    {
                        name: fn,
                        attachment: fn
                    }
                ], status: StatusCode.RETURN
            }
        }, "Gets messages", {
            permCheck: m => configManager.ADMINS.includes(m.author.id),
            docs: "If you reply to a message and run this command, archiving will start at that point"
        })
    ]

    yield [
        "rfile",
        ccmdV2(async function({ msg, args }) {
            let att = msg.attachments.at(0)
            if (att) {
                let data = await fetch(att.url)
                let text = Buffer.from(await data.arrayBuffer())
                return { content: text.toString(args[0] as BufferEncoding || "utf-8"), status: StatusCode.RETURN }
            }
            return { noSend: true, status: StatusCode.ERR }

        }, "Reads a file", {
            helpArguments: {

                file: createHelpArgument("must be an attachment", true),
                "decoding": createHelpArgument("The decoding method to use", false, undefined, "utf-8")
            }
        })
    ]

    yield ["tr", createCommandV2(async ({ args: argList, stdin, opts }) => {
        let charsToDel = opts.getString("d", "")
        argList.beginIter()
        let from = argList.expectString()
        if (from === BADVALUE && !charsToDel) {
            return { content: "Must have start chars", status: StatusCode.ERR }
        }
        let to = argList.expectString()
        if (to === BADVALUE && !charsToDel) {
            return { content: "Must have end chars", status: StatusCode.ERR }
        }
        let text: string = stdin ? getContentFromResult(stdin, "\n") : argList.expectString(truthy) as string
        if (!text) {
            return { content: "Must have text to translate on", status: StatusCode.ERR }
        }
        if (charsToDel) {
            for (let char of charsToDel) {
                text = text.replaceAll(char, "")
            }
        }
        if (from !== BADVALUE && to !== BADVALUE) {
            for (let i = 0; i < from.length; i++) {
                let charTo = to[i] ?? to.slice(-1)[0]
                text = text.replaceAll(from[i], charTo)
            }
        }
        return { content: text, status: StatusCode.RETURN }
    }, CAT, "translate characters", {
        from: createHelpArgument("The chars to translate from (not required with -d)", false),
        to: createHelpArgument("The chars to translate to (not required with -d)", false, "from")
    }, {
        d: cho("The chars to delete", true)
    })]

    yield [
        "timer", createCommandV2(async ({ msg, args, opts }) => {
            let action = args[0]?.toLowerCase()
            let actions = ["create", "delete", "get", "list", "lap", "has-x-units-passed"]

            timer.saveTimers()

            if (!actions.includes(action)) {
                return { content: `${action} is not a valid action\ncommand use: \`[timer <${actions.join(" | ")}> ...\``, status: StatusCode.ERR }
            }
            switch (action) {
                case "has-x-units-passed": {
                    let name = args[1]?.trim()
                    let t = timer.getTimer(msg.author.id, String(name))
                    if (t === undefined) {
                        return { content: `You do not have a timer named ${name}`, status: StatusCode.ERR }
                    }

                    let number = Number(args[2]?.trim())

                    if (isNaN(number)) {
                        return { content: `Must give a number`, status: StatusCode.ERR }
                    }

                    let unit = args[3]?.trim() || "MS"
                    let ms = Date.now() - t
                    let s = ms / 1000
                    let m = s / 60
                    let h = m / 60
                    let d = h / 24
                    let w = d / 7
                    if (unit.startsWith("s")) {
                        return { content: `${s >= number}`, status: StatusCode.RETURN }
                    }
                    else if (unit.startsWith("m")) {
                        return { content: `${m >= number}`, status: StatusCode.RETURN }
                    }
                    else if (unit.startsWith("h")) {
                        return { content: `${h >= number}`, status: StatusCode.RETURN }
                    }
                    else if (unit.startsWith("d")) {
                        return { content: `${d >= number}`, status: StatusCode.RETURN }
                    }
                    else if (unit.startsWith("w")) {
                        return { content: `${w >= number}`, status: StatusCode.RETURN }
                    }
                    return { content: `${Date.now() - t >= number}`, status: StatusCode.RETURN }
                }
                case "create": {
                    let name = String(args.slice(1).join(" ")).trim()
                    if (name[0] === "%") {
                        return { content: "Cannot create timer starting with %", status: StatusCode.ERR }
                    }
                    if (timer.getTimer(msg.author.id, name)) {
                        return { content: `You already have a timer called: ${name}`, status: StatusCode.ERR }
                    }
                    timer.createTimer(msg.author.id, name)
                    return { content: `${name} created`, status: StatusCode.RETURN }
                }
                case "delete": {
                    let name = String(args.slice(1).join(" ")).trim()
                    if (name[0] === "%") {
                        return { content: "Cannot delete timer starting with %", status: StatusCode.ERR }
                    }
                    if (!timer.getTimer(msg.author.id, name)) {
                        return { content: `You do not have a timer called ${name}`, status: StatusCode.ERR }
                    }
                    timer.deleteTimer(msg.author.id, name)
                    return { content: `${name} deleted`, status: StatusCode.RETURN }
                }
                case "get": {
                    return { content: String(timer.getTimer(msg.author.id, args.slice(1).join(" "))), status: StatusCode.RETURN }
                }
                case "list": {
                    let timers = timer.getTimersOfUser(msg.author.id)
                    if (!timers) {
                        return { content: "You do not have any timers", status: StatusCode.ERR }
                    }
                    let unit = args[1] || "ms"
                    let round = opts.getBool("round", opts.getBool("r", false)) ? Math.round : (x: any) => x
                    return { content: Object.entries(timers).map((v) => `${v[0]}: ${round(timer.do_lap(msg.author.id, v[0], unit as "ms") as number)}${unit}`).join("\n"), status: StatusCode.RETURN }
                }
                case "lap": {
                    let name = args[1]?.trim()
                    let unit = args[2]?.trim() || ""
                    let t = timer.getTimer(msg.author.id, name)
                    if (!t) {
                        return { content: `You do not have a timer called ${name}`, status: StatusCode.ERR }
                    }
                    let ms = Date.now() - t
                    let s = ms / 1000
                    let m = s / 60
                    let h = m / 60
                    let d = h / 24
                    let w = d / 7
                    switch (true) {
                        case unit.startsWith("s"):
                            return { content: `${s}`, status: StatusCode.RETURN }
                        case unit.startsWith("m"):
                            return { content: `${m}`, status: StatusCode.RETURN }
                        case unit.startsWith("h"):
                            return { content: `${h}`, status: StatusCode.RETURN }
                        case unit.startsWith("d"):
                            return { content: `${d}`, status: StatusCode.RETURN }
                        case unit.startsWith("w"):
                            return { content: `${w}`, status: StatusCode.RETURN }
                    }
                    return { content: `${Date.now() - t}`, status: StatusCode.RETURN }
                }
                default: {
                    return { content: "How did we get here", status: StatusCode.ERR }
                }

            }
        }, CommandCategory.UTIL, "gets info on timers"),
    ]

    yield [
        'blacklist', ccmdV2(async function({ msg, args }) {
            let addOrRemove = args[0]
            if (!["a", "r"].includes(addOrRemove)) {
                return {
                    content: "did not specify, (a)dd or (r)emove",
                    status: StatusCode.ERR
                }
            }
            let cmds: string[] = args.slice(1)
            if (!cmds.length) {
                return {
                    content: "no cmd given",
                    status: StatusCode.ERR
                }
            }
            cmds = cmds.filter(v => !commands.get(v))
            if (addOrRemove == "a") {
                common.addToPermList(common.BLACKLIST, "blacklists", msg.author, cmds)

                return {
                    content: `${msg.member} has been blacklisted from ${cmds.join(" ")}`,
                    status: StatusCode.RETURN
                }
            } else {
                common.removeFromPermList(common.BLACKLIST, "blacklists", msg.author, cmds)
                return {
                    content: `${msg.member} has been removed from the blacklist of ${cmds.join(" ")}`,
                    status: StatusCode.RETURN
                }
            }
        }, "Blacklist/unblacklist yourself from an alias")
    ]

    yield [
        "rand-user", ccmdV2(async function({ rawOpts: opts, msg, args }) {
            let member
            if (!opts['f'])
                member = (msg.channel as TextChannel).guild.members.cache.random()
            if (!member)
                member = (await (msg.channel as TextChannel).guild.members.fetch()).random()
            let fmt = args.join(" ") || "%u (%n)"
            return Pipe.start(member)
                .default({ content: "No member found" })
                .next(function(member: any) {
                    if (!member?.user) {
                        return
                    }
                    return [member, member.user]
                })
                .default({ content: "No user found" })
                .next(function(member: GuildMember, user: User) {
                    return {
                        content: formatMember(member, fmt)
                    }
                }).done()
        }, "Gives a random server member", {
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
        })
    ]

    yield [
        "role-info", ccmdV2(async ({ argShapeResults }) => {

            let role = argShapeResults['role'] as Role
            let fmt = argShapeResults['fmt'] as string
            if (fmt) {
                return crv(
                    format(fmt, {
                        i: role.id,
                        e: role.unicodeEmoji || "",
                        c: role.createdAt.toTimeString()
                    })
                )
            }
            let embed = new EmbedBuilder()
            embed.setTitle(role.name)
            embed.setColor(role.color)
            embed.addFields(efd(["id", String(role.id), true]))
            embed.addFields(efd(["name", role.name, true], ["emoji", role.unicodeEmoji || "None", true], ["created", role.createdAt.toTimeString(), true], ["Days Old", String((Date.now() - (new Date(role.createdTimestamp)).getTime()) / (1000 * 60 * 60 * 24)), true]))
            return { embeds: [embed] || "none", status: StatusCode.RETURN, allowedMentions: { parse: [] } }

        }, "Gets information about a role", {
            argShape: async function*(args, msg) {
                yield msg.guild ? [await args.expectRole(msg.guild, 1), "role"] : [BADVALUE, 'to be in a guild']
                yield [args.expectString(() => true), "fmt", true]
            },
            docs: "Format specifiers:<ul><li>i: role id</li><li>e: role emoji</li><li>c: role created at</li></ul>",
            helpArguments: {
                role: createHelpArgument("The role to get info of"),
                fmt: createHelpArgument("The format specifier")
            }
        })]

    yield [
        "channel-info", ccmdV2(async function({ msg, args }) {
            if (!msg.guild) return crv("Must be run in a guild", { status: StatusCode.ERR })
            let channel
            if (!args.join(" ").trim().length)
                channel = msg.channel
            else channel = await fetchChannel(msg.guild, args.join(" ").trim())
            if (!channel)
                return { content: "Channel not found", status: StatusCode.ERR }
            let daysSinceCreation = (Date.now() - (new Date(channel.createdTimestamp as number)).getTime()) / (1000 * 60 * 60 * 24)
            let embed = new EmbedBuilder()
            embed.setTitle("name" in channel ? channel.name : "Unknown name")
            let pinned
            if ("messages" in channel && (pinned = await channel.messages.fetchPinned())) {
                let pinCount = pinned.size
                let daysTillFull = (daysSinceCreation / pinCount) * (250 - pinCount)
                const yearsTillFull = daysTillFull / 365.2425
                embed.addFields(efd(["Pin Count", String(pinCount), true], ["Days till full", `${Math.round(daysTillFull * 100) / 100} (${Math.round(yearsTillFull * 100) / 100} years)`, true]))
            }
            embed.addFields(efd(["Created", channel.createdAt?.toString() || "N/A", true], ["Days since Creation", String(daysSinceCreation), true], ["Id", channel.id.toString(), true], ["Type", channel.type.toString(), true]))
            if ("topic" in channel && channel.topic) {
                embed.addFields(efd(["Topic", channel.topic, true]))
            }
            if ("nsfw" in channel) {
                embed.addFields(efd(["NSFW?", String(channel.nsfw), true]))
            }
            if ("position" in channel) {
                embed.addFields(efd(["Position", channel.position.toString(), true]))
            }
            return { embeds: [embed], status: StatusCode.RETURN }
        }, "Gets info about a channel")
    ]

    yield [
        "react", ccmdV2(async function({ msg, args, opts }) {
            const search = opts.getString("search", "")
            console.log(search)
            const reactTo = await searchMsg(msg, search)
            const reaction = args.join(" ")
            let emote = reaction.split(":")[2].slice(0, -1)
            let e
            try {
                e = await msg.guild?.emojis.fetch(emote)
            }
            catch (err) {
                e = reaction
            }
            await reactTo?.react(e as any)
            return crv("Reacted")
        }, "Reacts to a message")
    ]

    yield [
        "message-info", ccmdV2(async function({ msg, args, opts }) {

            const infoMsg = await searchMsg(msg, args.join(" "))

            if (!infoMsg) {
                return crv("No message found", { status: StatusCode.ERR })
            }

            const fmt = opts.getString("fmt", "{embed}")
            if (fmt !== "{embed}") {
                return crv(format(fmt, {
                    c: infoMsg.content,
                    a: infoMsg.author.displayName,
                    A: infoMsg.author.id,
                    U: infoMsg.author.avatarURL() || "#N/A",
                    i: infoMsg.id,
                    p: String(infoMsg.pinned),
                    t: String(infoMsg.tts),
                    C: infoMsg.createdAt.toString(),
                    T: String(infoMsg.createdTimestamp),
                    r: infoMsg.reference?.messageId || "#N/A",
                    e: String(infoMsg.mentions.everyone),
                }))
            }

            const e = new EmbedBuilder()

            if (infoMsg.content) {
                e.setDescription(infoMsg.content)
            }

            if (infoMsg.attachments.at(0)) {
                e.setThumbnail(infoMsg.attachments.at(0)!.url)
            }
            e.setAuthor({ iconURL: infoMsg.author.avatarURL() as string, name: infoMsg.author.displayName })

            e.addFields(efd(
                ["id", infoMsg.id, true],
                ['pinned', String(infoMsg.pinned), true],
                ['tts', String(infoMsg.tts), true],
                ['created at', infoMsg.createdAt.toString(), true],
                ['reply id', infoMsg.reference?.messageId || "#N/A", true],
                ['members mentions', infoMsg.mentions.members?.reduce((p, u) => `${p ? p + ", " : p}${u}`, "") || "#N/A", true],
                ['everyone', String(infoMsg.mentions.everyone), true],
            ))

            return { embeds: [e] }
        }, "Gets info about a message", {
            helpOptions: {
                fmt: createHelpOption(`The format to use<br><h4>Formats</h4>
<ul>
<li>c: message content</li>
<li>a: author displayName</li>
<li>A: author id</li>
<li>U: author avatar url</li>
<li>i: message id</li>
<li>p: message pinned state</li>
<li>t: message tts state</li>
<li>C: message created at</li>
<li>T: unix timestamp</li>
<li>r: message reply message id</li>
<li>e: message mentions everyone</li>
</ul>`)
            }
        })
    ]

    yield [
        "emote-info", ccmdV2(async function({ msg, args }) {
            let emote = args[0].split(":")[2].slice(0, -1)
            let e
            try {
                e = await msg.guild?.emojis.fetch(emote)
            }
            catch (err) {
                return { content: "No emoji found", status: StatusCode.ERR }
            }
            if (!e) {
                return { content: "No emoji foudn", status: StatusCode.ERR }
            }
            let embed = new EmbedBuilder()
            embed.setTitle(String(e.name))
            embed.addFields(efd(["id", e.id, true], ["created Date", e?.createdAt.toDateString(), true], ["Creation time", e?.createdAt.toTimeString(), true], ["THE CREATOR", String(e?.author), true]))
            if (e.url)
                embed.setThumbnail(e.url)
            embed.addFields(efd(["URL", e?.url, true]))
            return { embeds: [embed], status: StatusCode.RETURN }
        }, "Get a random emote", {
        })
    ]

    yield ["sticker-info", ccmdV2(async ({ msg, opts, args }) => {
        let sticker = msg.stickers.at(0)
        if (opts.getBool("r", false)) {
            sticker = (await msg.guild?.stickers.fetch())?.random()
        }
        if (!sticker) {
            return { content: "No sticker", status: StatusCode.ERR }
        }
        let fmt = args.join(" ") || "{embed}"
        if (fmt === "{embed}") {
            let embed = new EmbedBuilder()
            embed.setThumbnail(sticker.url)
            embed.addFields([
                { name: "type", value: sticker.type?.toString() || "N/A", inline: true },
                { name: "name", value: sticker.name, inline: true },
                { name: "id", value: sticker.id, inline: true },
                { name: "creator", value: sticker.user?.toString() || "N/A", inline: true },
                { name: "createdAt", value: sticker.createdAt.toString(), inline: true },
                { name: "format", value: sticker.format?.toString(), inline: true },
                { name: "tags", value: sticker.tags?.toString() || "N/A", inline: true }
            ])
            return { embeds: [embed], status: StatusCode.RETURN }
        }
        return { content: format(fmt, { "t": sticker.type?.toString() || "N/A", n: sticker.name, i: sticker.id, c: sticker.user?.username || "N/A", T: sticker.createdAt.toString(), f: sticker.format?.toString(), "#": sticker.tags || "N/A" }), status: StatusCode.RETURN }
    }, "Gets info on a sticker", {
        docs: `<lh>format specifiers</lh><br>
<ul>
<li>t: type</li>
<li>n: name</li>
<li>i: id</li>
<li>c: creator</li>
<li>T: created at</li>
<li>f: format</li>
<li#: tags</li>
</ul>`,
        helpArguments: {
            sticker: createHelpArgument("The sticker to use", true),
            fmt: createHelpArgument("The format specifier", false, "{embed}")
        }
    },)]

    yield [
        "server-info", ccmdV2(async function({ msg, args, opts }) {

            if (!msg.guild) {
                return crv("Not in a server", { status: StatusCode.ERR })
            }

            const fmt = args.join(" ") || "{embed}"

            const guild = msg.guild

            const fetchAll = opts.getBool("fa", false)

            if (opts.getBool("fe", fetchAll)) {
                await guild.emojis.fetch()
            }
            if (opts.getBool("fr", fetchAll)) {
                await guild.roles.fetch()
            }
            if (opts.getBool("fm", fetchAll)) {
                await guild.members.fetch()
            }
            if (fmt !== "{embed}") {
                return crv(format(fmt, {
                    i: guild.id,
                    E: String(guild.emojis.cache.size),
                    e: guild.emojis.cache.reduce((p, c) => `${p}\n${c}`, ""),
                    R: String(guild.roles.cache.size),
                    r: guild.roles.cache.reduce((p, c) => `${p}\n${c}`, ""),
                    B: String(guild.bans.cache.size),
                    d: guild.description || "#N/A",
                    M: String(guild.members.cache.size),
                    m: guild.members.cache.reduce((p, c) => `${p}\n${c}`, ""),
                    n: guild.name,
                    s: guild.systemChannelId || "#N/A",
                    o: guild.ownerId
                }))
            }
            const e = new EmbedBuilder()

            e.setThumbnail(guild.iconURL())

            const banner = guild.bannerURL()

            if (banner)
                e.setAuthor({ iconURL: banner, name: guild.name })
            else e.setAuthor({ name: guild.name })

            e.addFields(efd(
                ["id", guild.id, true],
                ["role count", String(guild.roles.cache.size), true],
                ["member count", String(guild.members.cache.size), true],
                ["created at", guild.createdAt.toString(), true],
                ["ban count", String((await guild.bans.fetch()).size), true],
                ["description", guild.description || "#N/A", true],
                ["emoji count", String(guild.emojis.cache.size), true],
                ["rules channel", `<#${guild.rulesChannel?.id}>`, true],
                ["system channel", `<#${guild.systemChannelId}>`, true],
                ["owner", `<@${guild.ownerId}>`, true]
            ))

            return { embeds: [e], status: StatusCode.RETURN }

        }, "Gets info about the server", {
            helpArguments: {
                fmt: createHelpArgument(`Fmt to use instead of showing an embed<br><h3>Formats</h3>
<ul>
<li>i: guild id</li>
<li>E: emoji count</li>
<LI>e: emojis</li>
<li>R: role count</li>
<li>r: roles</li>
<li>B: ban count</li>
<li>d: description</li>
<li>M: member count</li>
<li>m: members</li>
<li>n: name</li>
<li>s: system channel id</li>
<li>o: owner id</li>`)
            },
            helpOptions: {
                fe: createHelpOption("Fetch all emojis before checking the cache"),
                fr: createHelpOption("Fetch all roles before checking the cache"),
                fm: createHelpOption("Fetch all members before checking the cache"),
                fa: createHelpOption("Fetch everything")
            }
        })
    ]

    yield [
        "user-info!", ccmdV2(async function({ argShapeResults }) {
            let search = argShapeResults['user'] as string
            let user = await fetchUserFromClient(common.client, search)

            if (!user) {
                return { content: `${search} not found`, status: StatusCode.ERR }
            }

            let fmt = argShapeResults['fmt']
            if (typeof fmt === 'string') {
                return {
                    content: format(fmt, {
                        i: user.id || "#!N/A",
                        u: user.username || "#!N/A",
                        c: user.createdAt.toString() || "#!N/A",
                        a: user.avatarURL() || "#!N/A"
                    }),
                    status: StatusCode.RETURN
                }
            }
            let e = new EmbedBuilder()
            e.setTitle(user.username)
            let aurl = user.avatarURL()
            if (aurl)
                e.setThumbnail(aurl)
            e.addFields(efd(["id", user.id], ["created at", user.createdAt.toString()], ["avatar url", String(aurl)]))

            return {
                embeds: [e],
                status: StatusCode.RETURN
            }

        }, "gets the user info of a user", {
            helpArguments: {
                user: createHelpArgument("The user to search for"),
                '...fmt': createHelpArgument("The format to use<br><lh>formats</lh><ul><li>i: user id</li><li>u: username</li><li>c: created at timestamp</li><li>a: avatar url</li></ul>", false, undefined, "an embed")
            },
            argShape: async function*(args) {
                yield [args.expectString(1), "user"],
                    yield [args.expectString(i => i ? true : BADVALUE), "fmt", true]
            }
        })
    ]

    yield [
        "user-info", ccmdV2(async function({ args, msg }) {
            if (!args[0]) {
                return {
                    content: "no member given!",
                    status: StatusCode.ERR
                }
            }
            let member = msg.guild
                ? await fetchUser(msg.guild, args[0])
                : await fetchUserFromClient(common.client, args[0])
            return Pipe.start(member)
                .default({ content: "member not found", status: StatusCode.ERR })
                .next((member: GuildMember) => {
                    if (!member.user) {
                        return
                    }
                    return [member, member.user]
                })
                .next((member: GuildMember, user: User) => {
                    if (args[1]) {
                        const fmt = args.slice(1).join(" ")
                        return {
                            content: formatMember(member, fmt)
                        }
                    }
                    let embed = new EmbedBuilder()
                    embed.setColor(member.displayColor)
                    embed.setThumbnail(user.avatarURL() || "")
                    let fields = [{ name: "Id", value: user.id || "#!N/A", inline: true }, { name: "Username", value: user.username || "#!N/A", inline: true }, { name: "Nickname", value: member.displayName || "#!N/A", inline: true }, { name: "0xColor", value: member.displayHexColor.toString() || "#!N/A", inline: true }, { name: "Color", value: member.displayColor.toString() || "#!N/A", inline: true }, { name: "Created at", value: user.createdAt.toString() || "#!N/A", inline: true }, { name: "Joined at", value: member.joinedAt?.toString() || "#!N/A", inline: true }, { name: "Boosting since", value: member.premiumSince?.toString() || "#!N/A", inline: true },]
                    embed.addFields(fields)
                    return {
                        embeds: [embed]
                    }
                }).done()
        }, "Gets info on a member", {
            docs: `valid formats:
<ul>
    <li>
    <code>{id}</code> or <code>{i}</code> or <code>%i</code>: user id
    </li>
    <li>
    <code>{username}</code> or <code>{u}</code> or <code>%u</code>: user username
    </li>
    <li>
    <code>{nickname}</code> or <code>{n}</code> or <code>%n</code>: user nickname
    </li>
    <li>
    <code>{0xcolor}</code> or <code>{X}</code> or <code>%X</code>: user color in hex
    </li>
    <li>
    <code>{color}</code> or <code>{x}</code> or <code>%x</code>: user color
    </li>
    <li>
    <code>{created}</code> or <code>{c}</code> or <code>%c</code>: when the user was created
    </li>
    <li>
    <code>{joined}</code> or <code>{j}</code> or <code>%j</code>: when the user joined the server
    </li>
    <li>
    <code>{boost}</code> or <code>{b}</code> or <code>%b</code>: when the user started boosting the server
    </li>
    <li>
    <code>{status}</code> or <code>{s}</code> or <code>%s</code>: gets the platform/status of the user
</ul>`
        })
    ]

    yield [
        "rand-emote", ccmdV2(async function({ msg, rawOpts: opts }) {
            let amount = parseInt(String(opts['count'] || opts['c'])) || 1
            let sep = opts['sep'] || opts['s'] || "\n"
            sep = String(sep)
            let send = ""
            let emojis = await msg.guild?.emojis.fetch()
            if (!emojis) {
                return { content: "Could not find emojis", status: StatusCode.ERR }
            }
            if (Boolean(opts['a'])) {
                emojis = emojis.filter(e => e.animated ? true : false)

            }
            else if (Boolean(opts['A'])) {
                emojis = emojis.filter(e => e.animated ? false : true)
            }
            else if (opts['f']) {
                emojis = emojis.filter((e) => Boolean(safeEval(String(opts['f']), { id: e.id, animated: e.animated, url: e.url, createdAt: e.createdAt, createdTimeStamp: e.createdTimestamp, name: e.name, identifier: e.identifier }, { timeout: 1000 })))
            }
            for (let i = 0; i < amount; i++) {
                send += String(emojis.random())
                send += sep
            }
            return { content: send, status: StatusCode.RETURN }
        }, "Gives a random server emoji", {
            options: {
                "c": {
                    description: "The amount of emojis to send",
                    alternatives: ["count"]
                },
                "s": {
                    description: "The character to seperate each emoji by",
                    alternatives: ["sep"]
                },
                "a": {
                    description: "The emoji must be animated"
                },
                "A": {
                    description: "The emoji can't be animated"
                },
                'f': {
                    description: "Custom filter"
                }
            }
        })
    ]

    yield [
        "emote-use", ccmdV2(async function({ msg, opts }) {
            let serverOnly = opts.getBool('S', false)
            let data = useTracker.emoteUsage.generateUsageText()
                .split("\n")
                .map(v => v.split(":"))
                .filter(v => v[0])
            let newData: [string | GuildEmoji, string][] = []
            let cachedEmojis = await msg.guild?.emojis.fetch()
            for (let i = 0; i < data.length; i++) {
                let emoji: string | GuildEmoji | undefined | null = data[i][0];
                try {
                    emoji = cachedEmojis?.find((v) => v.id == data[i][0])
                }
                catch (err) {
                    if (serverOnly) continue
                    emoji = data[i][0]
                }
                if (!emoji) {
                    if (serverOnly) continue
                    emoji = data[i][0]
                }
                newData.push([emoji, data[i][1]])
            }
            let finalData = newData
                .sort((a, b) => Number(a[1]) - Number(b[1]))
                .reverse()
                .map(v => `${v[0]}: ${v[1]}`)
                .join("\n")
            return { content: finalData, status: StatusCode.RETURN }

        }, "Gets the amount of times server emotes have been used", {
            helpOptions: {
                S: createHelpOption("Show emote use of all emojis, even ones not from this server")
            }
        })
    ]

    yield [
        "invite", ccmdV2(async function({ msg }) {
            let invites = await msg.guild?.invites.fetch()
            if (invites?.at(0)?.url) {
                return { content: invites.at(0)?.url, status: StatusCode.RETURN }
            }
            return { content: "No invite found", status: StatusCode.ERR }
        }, "Gets an invite link for the server")
    ]

    yield [
        "non-assigned-roles", ccmdV2(async function({ msg }) {
            await msg.guild?.members.fetch()
            let roles = await msg.guild?.roles.fetch()
            if (!roles) return crv("No roles found", { status: StatusCode.ERR })
            let rolesNonAssigned: any[] = []
            for (let role of roles) {
                if (role[1].members.size < 1)
                    rolesNonAssigned.push(role[1].name)
            }
            return { content: rolesNonAssigned.join("\n") + `\n${rolesNonAssigned.length} roles do not have any members`, status: StatusCode.RETURN }
        }, "Gets a list of non-assigned-roles")
    ]

    yield [
        "tail", createCommandV2(async ({ args, opts, stdin }) => {
            let count = opts.getNumber("count", 10)
            let argText = stdin ? getContentFromResult(stdin, "\n") : args.join(" ")
            return { content: argText.split("\n").reverse().slice(0, count).reverse().join("\n"), status: StatusCode.RETURN }

        }, CAT, "Get the last 10 lines", { text: createHelpArgument("The text to get the last lines of (also accepts pipe)", true) }, { count: createHelpOption("get the lats n lines instead of 1", undefined, "10") })
    ]

    yield [
        "head", createCommandV2(async ({ args, opts, stdin }) => {
            let count = opts.getNumber("count", 10)
            let argText = stdin ? getContentFromResult(stdin, "\n") : args.join(" ")
            return { content: argText.split("\n").slice(0, count).join("\n"), status: StatusCode.RETURN }

        }, CAT, "Say the first 10 lines of somet text", { text: createHelpArgument("Text also accepts pipe") }, { count: createHelpOption("The amount of lines to show") })
    ]

    yield [
        "nl", ccmdV2(async ({ args, stdin }) => {
            let text = stdin ? getContentFromResult(stdin, "\n").split("\n") : args.join(" ").split('\n')
            return crv(Array.from(text, (line, i) => `${i + 1}: ${line}`).join("\n"))

        }, "Number the lines of text", {
            helpArguments: { "...text": createHelpArgument("The text to number each line of", false) },
            accepts_stdin: "Can be used instead of <code>...text</code>"
        })
    ]

    yield [
        "grep", ccmdV2(async ({ msg, args, stdin, opts }) => {
            args.beginIter()
            let regex = args.expectString((_, __, argsUsed) => stdin ? true : argsUsed < 1)
            if (regex === BADVALUE) {
                return {
                    content: "no search given",
                    status: StatusCode.ERR
                }
            }
            let data = stdin ? getContentFromResult(stdin) : args.expectString(truthy)

            if (!data || data === BADVALUE) {
                let attachment = msg.attachments?.at(0)
                if (attachment) {
                    let res = await fetch(attachment.url)
                    data = await res.text()
                }
                else return { content: "no data given to search through", status: StatusCode.ERR }
            }
            let outputSep = opts.getString("o", "\n")
            if (opts.getBool("G", false)) {
                let matcher = new RegExp(regex)
                let results = ""
                let lines = data.split("\n")
                let number = opts.getBool("n", false)
                let after = opts.getNumber("A", 0)
                let afterGroupSep = opts.getString("Asep", "A===========\n")

                let untilMatching = opts.getString("until", "")
                let untilMatchingR = untilMatching ? new RegExp(untilMatching) : false

                let reverse = opts.getBool("v", false)

                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i]
                    const matches = line.match(matcher)
                    if ((!reverse && matches) || (reverse && !matches)) {
                        let goingToAdd = ""
                        let shouldAdd = true
                        if (number) {
                            goingToAdd += `${i + 1} ${line}${outputSep}`
                        } else {
                            goingToAdd += `${line}${outputSep}`
                        }
                        if (after) {
                            const end = i + after
                            //i++ to start on next line
                            i++
                            for (; i < lines.length && i < end; i++) {
                                goingToAdd += `${lines[i]}${outputSep}`
                            }
                            goingToAdd += afterGroupSep
                        } else if (untilMatchingR) {
                            shouldAdd = false
                            i++
                            for (; i < lines.length; i++) {
                                if (lines[i].match(untilMatchingR)) {
                                    shouldAdd = true
                                    break
                                }
                                goingToAdd += `${lines[i]}${outputSep}`
                            }
                            goingToAdd += afterGroupSep
                        }
                        //this will only be false if --until is given and it fails to match
                        if (shouldAdd) {
                            results += goingToAdd
                        }
                    }
                }
                return crv(results)
            }
            let match = (<string>data).matchAll(new RegExp(regex, "gm"))
            let finds = ""
            for (let find of match) {
                if (opts.getBool("s", false)) {
                    if (find[1]) {
                        finds += find.slice(1).join(", ")
                    }
                    else {
                        finds += find[0]
                    }
                    finds += outputSep
                }
                else {
                    if (find[1]) {
                        finds += `Found \`${find.slice(1).join(", ")}\` at character ${(find?.index ?? 0) + 1}\n`
                    }
                    else {
                        finds += `Found \`${find[0]}\` at character ${(find?.index ?? 0) + 1}\n`
                    }
                }
            }
            return {
                content: finds,
                status: StatusCode.RETURN
            }
        }, "Search through text with a search", {
            helpArguments: {
                search: createHelpArgument("A regex search", true),
                data: createHelpArgument("Text or a file to search through")
            },
            helpOptions: {
                s: cho("dont give back the extra \"found x at char...\" text"),
                o: cho("output seperator, defaults to \\n (requires -s or -G)", true, "\\n"),
                G: cho("work line by line instead of simply finding all matches (enables other options)"),
                n: cho("number each found line with the line number it was found on (requires -G)"),
                A: cho("number of lines to get after a match (requires -G)", true, "0"),
                Asep: cho("seperator between each -A group", true, "A===========\n"),
                until: cho("get lines after a match until it finds this match (requires -G)<br>failes to match if the until match is not found", true),
                v: cho("get all non-matching lines (requires -G)")
            },
            accepts_stdin: "Can be used instead of <code>data</code>",
            gen_opts: true
        })
    ]
}
