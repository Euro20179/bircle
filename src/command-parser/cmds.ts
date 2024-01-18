import fs from 'fs'
import { Message, MessageCreateOptions, MessagePayload } from 'discord.js'
import lexer from './lexer'
import runner from './runner'
import tokenEvaluator from './token-evaluator'
import { isMsgChannel, mimeTypeToFileExtension } from '../util'
import { StatusCode } from '../common_to_commands'

export class SymbolTable {
    symbols: Record<string, string>
    constructor() {
        this.symbols = {}
    }
    set(name: string, value: string) {
        this.symbols[name] = value
    }
    get(name: string) {
        return this.symbols[name] || `(${name}:UNDEFINED)`
    }

    delete(name: string){
        if(this.symbols[name] !== undefined)
            delete this.symbols[name]
    }
}

async function runcmd(command: string, prefix: string, msg: Message) {
    let modifiers = lexer.getModifiers(command)

    let symbols = new SymbolTable()

    let rv: CommandReturn | undefined;

    let lex = new lexer.Lexer(command, {
        prefix
    })
    let tokens = lex.lex()
    let semi_indexes = []
    let pipe_indexes = []
    for (let i = 0; i < tokens.length; i++) {
        if (tokens[i] instanceof lexer.TTSemi) {
            semi_indexes.push(i)
        }
        else if (tokens[i] instanceof lexer.TTPipe) {
            pipe_indexes.push(i)
        }
    }

    semi_indexes.push(tokens.length)
    pipe_indexes.push(tokens.length)

    let start_idx = 0
    for (let semi_index of semi_indexes) {
        rv = undefined
        let working_tokens = tokens.slice(start_idx, semi_index)

        let pipe_start_idx = start_idx
        for (let pipe_idx of pipe_indexes) {
            if (pipe_idx < start_idx) {
                continue
            }
            else if (pipe_idx > semi_index) {
                break
            }

            let pipe_working_tokens = working_tokens.slice(pipe_start_idx, pipe_idx)

            if(rv){
                symbols.set("stdin:%", rv.content ?? "")
            }
            else {
                symbols.delete("stdin:%")
            }


            let evalulator = new tokenEvaluator.TokenEvaluator(pipe_working_tokens, symbols, msg)
            let new_tokens = await evalulator.evaluate()
            rv = await runner.command_runner(new_tokens, msg, rv)
            pipe_start_idx = pipe_idx + 1
        }
        if (rv && semi_index != semi_indexes[semi_indexes.length - 1]) {
            await handleSending(msg, rv)
        }
        start_idx = semi_index + 1
    }
    return rv ?? { content: `\\${command}(NO MESSAGE)`, status: StatusCode.RETURN }
}

async function handleSending(msg: Message, rv: CommandReturn, sendCallback?: (data: MessageCreateOptions | MessagePayload | string) => Promise<Message>, recursion = 0): Promise<Message> {
    if (!isMsgChannel(msg.channel)) return msg

    if (!Object.keys(rv).length) {
        return msg
    }

    if (!sendCallback) {
        sendCallback = rv.sendCallback || rv.reply ? msg.reply.bind(msg) :
            rv.channel?.send.bind(rv.channel) ||
            msg.channel.send.bind(msg.channel)
    }

    if (rv.delete) {
        msg.delete().catch(console.error)
    }

    if (rv.noSend) {
        return msg
    }

    if (!rv?.content) {
        //if content is empty string, delete it so it shows up as undefined to discord, so it wont bother trying to send an empty string
        delete rv['content']
    }
    //if the content is > 2000 (discord limit), send a file instead
    if ((rv.content?.length || 0) >= 2000) {
        let oldContent = rv.content
        if (rv.onOver2kLimit) {
            rv = rv.onOver2kLimit(msg, rv)
        }
        let fn = `./garbage-files/${msg.author.id}-${msg.id}`
        fs.writeFileSync(fn, rv.content as string)
        let extension = rv.mimetype ? mimeTypeToFileExtension(rv.mimetype) || "txt" : "txt"
        rv.files = (rv.files ?? []).concat([{ attachment: fn, name: `cmd.${extension}`, description: "command output too long", wasContent: oldContent }])
        delete rv["content"]
    }

    let newMsg = msg
    try {
        if (rv.silent !== true) {
            newMsg = await sendCallback(rv as MessageCreateOptions)
        }
    }
    catch (err) {
        console.error(err)
        if (rv.silent !== true)
            newMsg = await sendCallback({ content: `${err}` })
    }
    return newMsg
}

export default {
    runcmd,
    handleSending,
    SymbolTable
}
