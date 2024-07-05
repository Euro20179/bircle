import fs from 'fs'
import ytdl from 'ytdl-core'


import { CommandCategory, createCommandV2, StatusCode } from '../common_to_commands'
import {  generateFileName } from '../util'
import { EmbedBuilder } from 'discord.js'
import { AudioPlayerStatus, createAudioPlayer, createAudioResource, DiscordGatewayAdapterCreator, getVoiceConnection, joinVoiceChannel, NoSubscriberBehavior, VoiceConnection } from '@discordjs/voice'
import { Queue } from '../queue'

import iterators from '../iterators'
import { spawn } from 'child_process'

let currently_playing: { link: string, filename: string } | undefined;

function setCurrentlyPlaying(to: { link: string, filename: string } | undefined) {
    currently_playing = to
}

let connection: VoiceConnection | undefined;
let vc_queue: Queue<{link: string, filename: string}> = new Queue()
const player = createAudioPlayer({
    behaviors: {
        noSubscriber: NoSubscriberBehavior.Pause
    }
})


async function play_next_in_queue_or_destroy_connection(_queue: typeof vc_queue){
    let new_link = vc_queue.dequeue()
    if(new_link){
        play_link(new_link)
        return true
    }
    else{
        vc_queue.clear()
        connection?.destroy()
    }
    return false
}

async function play_link({ link, filename }: { link: string, filename: string }) {
    setCurrentlyPlaying({ link: link, filename: filename })
    let is_valid_url
    let fn = filename
    try {
        is_valid_url = ytdl.validateURL(link)
    }
    catch (err) {
        if(!play_next_in_queue_or_destroy_connection(vc_queue)){
            return
        }
    }
    if (is_valid_url) {
        const ytdlp = spawn(`yt-dlp`, ["-o", "-", link])
        let resource = createAudioResource(ytdlp.stdout)
        player.play(resource)
        connection?.subscribe(player)
    }
    else {
        fetch(link).then(data => {
            data.arrayBuffer().then(value => {
                if (value.byteLength >= 1024 * 1024 * 20) {
                    if(!play_next_in_queue_or_destroy_connection(vc_queue)){
                        return
                    }
                }
                fs.writeFile(fn, Buffer.from(value), () => {
                    let resource = createAudioResource(fn)
                    player.play(resource)
                    connection?.subscribe(player)
                })
            })
        }).catch(_err => {
            !play_next_in_queue_or_destroy_connection(vc_queue)
        })
    }
}
player.on(AudioPlayerStatus.Idle, (_err) => {
    fs.rmSync(currently_playing?.filename as string)
    play_next_in_queue_or_destroy_connection(vc_queue)
})

export default function*() {
    yield [
        'play', createCommandV2(async ({msg, args}) => {
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
                adapterCreator: voice_state.guild.voiceAdapterCreator as DiscordGatewayAdapterCreator
            })

            vc_queue.enqueue({ link: link, filename: `${generateFileName("play", msg.author.id).replace(/\.txt$/, ".mp3").replaceAll(":", "_")}` })
            if (player.state.status === AudioPlayerStatus.Playing) {
                return { content: `${link} added to queue`, status: StatusCode.RETURN }
            }
            play_link(vc_queue.dequeue() as { link: string, filename: string })
            return { content: `loading: ${link}`, status: StatusCode.RETURN }
        }, CommandCategory.VOICE, undefined, undefined, undefined, undefined, undefined, undefined, undefined, false),
    ]

    yield ["skip", createCommandV2(async() => {
        player.stop()
    }, CommandCategory.VOICE, "Skip the current song", undefined, undefined, undefined, undefined, undefined, undefined, false)]

    yield ["pause", createCommandV2(async() => {
        player.pause()
    }, CommandCategory.VOICE, "Pause the current song", undefined, undefined, undefined, undefined, undefined, undefined, false)]

    yield ["unpause", createCommandV2(async() => {
        player.unpause()
    }, CommandCategory.VOICE, "Unpause the current song", undefined, undefined, undefined, undefined, undefined, undefined, false)]

    yield [
        'queue', createCommandV2(async () => {
            let embed = new EmbedBuilder()
            embed.setTitle("queue")
            embed.setDescription(String(currently_playing?.link) || "None")
            let content = iterators.reduce(
                new iterators.Iter(iterators.intoIter(vc_queue)).map((v: any) => v.link),
                "", (p, c) => p + c)
            return { content: content, embeds: [embed], status: StatusCode.RETURN }
        }, CommandCategory.VOICE, "See the music queue", undefined, undefined, undefined, undefined, undefined, undefined, false),
    ]

    yield [
        'next', createCommandV2(async ({msg}) => {
            let voice_state = msg.member?.voice
            if (!voice_state?.channelId) {
                return { content: "No voice", status: StatusCode.ERR }
            }
            fs.rmSync(currently_playing?.filename as string)
            play_next_in_queue_or_destroy_connection(vc_queue)
            return { content: "next", status: StatusCode.RETURN }
        }, CommandCategory.VOICE, "Play the next song in queue", undefined, undefined, undefined, undefined, undefined, undefined, false),
    ]

    yield [
    'leave', createCommandV2(async ({msg}) => {
        vc_queue.clear()
        let voice_state = msg.member?.voice
        if (!voice_state?.channelId) {
            return { content: "No voice", status: StatusCode.ERR }
        }
        let con = getVoiceConnection(voice_state.guild.id)
        if (con) {
            vc_queue.clear()
            con.destroy()
            return { content: "Left vc", status: StatusCode.RETURN }
        }
        else {
            return { content: "Not in vc", status: StatusCode.ERR }
        }
    }, CommandCategory.VOICE, "Leave voice chat", undefined, undefined, undefined, undefined, undefined, undefined, false),
    ]
}
