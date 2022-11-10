
import fs from 'fs'
import ytdl = require("ytdl-core")
import fetch = require("node-fetch")

import economy = require('./economy')
import pet = require("./pets")
import user_options = require("./user-options")


import { prefix } from './common'
import { CommandCategory, createCommand, createHelpArgument, createHelpOption, currently_playing, generateDefaultRecurseBans, getCommands, handleSending, registerCommand, setCurrentlyPlaying, StatusCode } from './common_to_commands'
import { format, generateFileName, getOpts } from './util'
import { MessageEmbed } from 'discord.js'
import { giveItem, saveItems } from './shop'
import { AudioPlayerStatus, createAudioPlayer, createAudioResource, getVoiceConnection, joinVoiceChannel, NoSubscriberBehavior, VoiceConnection } from '@discordjs/voice'
const { buyItem, hasItem, useItem } = require('./shop')

const { ITEMS, INVENTORY } = require("./shop")
let connection: VoiceConnection | undefined;
let vc_queue: { link: string, filename: string }[] = []
const player = createAudioPlayer({
    behaviors: {
        noSubscriber: NoSubscriberBehavior.Pause
    }
})
async function play_link({ link, filename }: { link: string, filename: string }) {
    setCurrentlyPlaying({ link: link, filename: filename })
    let is_valid_url
    let fn = filename
    try {
        is_valid_url = ytdl.validateURL(link)
    }
    catch (err) {
        let new_link = vc_queue.shift()
        if (new_link) {
            play_link(new_link)
        }
        else {
            vc_queue = []
            connection?.destroy()
        }
        return
    }
    if (is_valid_url) {
        let info = await ytdl.getInfo(link)
        if (info.videoDetails.isLiveContent || parseFloat(info.videoDetails.lengthSeconds) > 60 * 30) {
            let new_link = vc_queue.shift()
            if (new_link) {
                play_link(new_link)
            }
            else {
                vc_queue = []
                connection?.destroy()
            }
        }
        ytdl(link, { filter: "audioonly" }).pipe(fs.createWriteStream(fn)).on("close", () => {
            let resource = createAudioResource(fn)

            player.play(resource)
            connection?.subscribe(player)
        })
    }
    else {
        fetch.default(link).then(data => {
            data.buffer().then(value => {
                if (value.byteLength >= 1024 * 1024 * 20) {
                    let new_link = vc_queue.shift()
                    if (new_link) {
                        play_link(new_link)
                    }
                    else {
                        vc_queue = []
                        connection?.destroy()
                    }
                    return
                }
                fs.writeFile(fn, value, () => {
                    let resource = createAudioResource(fn)
                    player.play(resource)
                    connection?.subscribe(player)
                })
            })
        }).catch(err => {
            let new_link = vc_queue.shift()
            if (new_link) {
                play_link(new_link)
            }
            else {
                vc_queue = []
                connection?.destroy()
            }
        })
    }
}
player.on(AudioPlayerStatus.Idle, (err) => {
    fs.rmSync(currently_playing?.filename as string)
    let new_link = vc_queue.shift()
    if (new_link) {
        play_link(new_link)
    }
    else {
        vc_queue = []
        connection?.destroy()
    }

})

export default function() {
    registerCommand(
        'play', createCommand(async (msg, args) => {
            let link = args.join(" ")
            let attachment = msg.attachments.at(0)
            if (attachment) {
                link = attachment.url
            }
            let voice_state = msg.member?.voice
            if (!voice_state?.channelId) {
                return { content: "No voice", status: StatusCode.ERR }
            }
            connection = joinVoiceChannel({
                channelId: voice_state.channelId,
                guildId: msg.guildId as string,
                //dont unleash the beast that is this massive error message that doesn't even do anything
                //@ts-ignore
                adapterCreator: voice_state.guild.voiceAdapterCreator
            })

            vc_queue.push({ link: link, filename: `${generateFileName("play", msg.author.id).replace(/\.txt$/, ".mp3").replaceAll(":", "_")}` })
            if (player.state.status === AudioPlayerStatus.Playing) {
                return { content: `${link} added to queue`, status: StatusCode.RETURN }
            }
            play_link(vc_queue.shift() as { link: string, filename: string })
            return { content: `loading: ${link}`, status: StatusCode.RETURN }
        }, CommandCategory.VOICE),
    )

    registerCommand(
        'queue', createCommand(async (msg, args) => {
            let embed = new MessageEmbed()
            embed.setTitle("queue")
            embed.setDescription(String(currently_playing?.link) || "None")
            return { content: vc_queue.map(v => v.link).join("\n"), embeds: [embed], status: StatusCode.RETURN }
        }, CommandCategory.VOICE),
    )

    registerCommand(
        'next', createCommand(async (msg, args) => {
            let voice_state = msg.member?.voice
            if (!voice_state?.channelId) {
                return { content: "No voice", status: StatusCode.ERR }
            }
            fs.rmSync(currently_playing?.filename as string)
            let new_link = vc_queue.shift()
            if (new_link) {
                play_link(new_link)
            }
            else {
                vc_queue = []
                connection?.destroy()
            }
            return { content: "next", status: StatusCode.RETURN }
        }, CommandCategory.VOICE),
    )

    registerCommand(
    'leave', createCommand(async (msg, args) => {
        vc_queue = []
        let voice_state = msg.member?.voice
        if (!voice_state?.channelId) {
            return { content: "No voice", status: StatusCode.ERR }
        }
        let con = getVoiceConnection(voice_state.guild.id)
        if (con) {
            vc_queue = []
            con.destroy()
            return { content: "Left vc", status: StatusCode.RETURN }
        }
        else {
            return { content: "Not in vc", status: StatusCode.ERR }
        }
    }, CommandCategory.VOICE),
    )
}