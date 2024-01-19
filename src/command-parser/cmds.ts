import fs from 'fs'
import { Message, MessageCreateOptions, MessagePayload } from 'discord.js'
import lexer from './lexer'
import runner from './runner'
import tokenEvaluator from './token-evaluator'
import { isMsgChannel, mimeTypeToFileExtension } from '../util'
import { StatusCode } from '../common_to_commands'

import { RECURSION_LIMIT } from '../globals'

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

    delete(name: string) {
        if (this.symbols[name] !== undefined)
            delete this.symbols[name]
    }
}

type RuntimeOption = "silent" | "remote" | "skip" | "typing" | "delete" | "command" | "alias" | "legacy" | "recursion_limit" | "recursion"
type RuntimeOptionValue = {
    silent: boolean,
    remote: boolean,
    skip: boolean,
    typing: boolean,
    delete: boolean,
    command: boolean,
    alias: boolean,
    legacy: boolean
    recursion_limit: number
    recursion: number
}
export class RuntimeOptions {
    public options: Record<RuntimeOption, RuntimeOptionValue[keyof RuntimeOptionValue]>
    constructor(options?: Record<RuntimeOption, RuntimeOptionValue[keyof RuntimeOptionValue]>) {
        this.options = options ?? {} as Record<RuntimeOption, RuntimeOptionValue[keyof RuntimeOptionValue]>
    }
    get<T extends RuntimeOption>(option: T, default_: RuntimeOptionValue[T]): RuntimeOptionValue[T] {
        return this.options[option] as RuntimeOptionValue[T] ?? default_
    }
    set<T extends RuntimeOption>(option: T, value: RuntimeOptionValue[T]) {
        this.options[option] = value
    }
}

//TODO:
//missing support for:
//recursion_count
//banned_commands
async function runcmd(command: string, prefix: string, msg: Message, sendCallback?: ((options: MessageCreateOptions | MessagePayload | string) => Promise<Message>), runtime_opts?: RuntimeOptions) {

    let modifiers;
    [command, modifiers] = lexer.getModifiers(command.slice(prefix.length))

    if (!runtime_opts) {
        runtime_opts = new RuntimeOptions()
        runtime_opts.set("recursion_limit", RECURSION_LIMIT)
        runtime_opts.set("recursion", 0)
    }

    runtime_opts.set("recursion", runtime_opts.get("recursion", 0) + 1)

    if(runtime_opts.get("recursion", 0) > runtime_opts.get("recursion_limit", RECURSION_LIMIT)){
        return { content: "Recursion limit reached", status: StatusCode.ERR }
    }


    for (let modifier of modifiers) {
        modifier.set_runtime_opt(runtime_opts)
    }

    if (runtime_opts.get("delete", false)) {
        if (msg.deletable) {
            msg.delete().catch(console.error)
        }
    }

    let symbols = new SymbolTable()

    let rv: CommandReturn | undefined;

    let lex = new lexer.Lexer(command, {
        prefix,
        is_command: false,
        skip_parsing: runtime_opts.get("skip", false)
    })
    let tokens = lex.lex()
    let semi_indexes = []
    for (let i = 0; i < tokens.length; i++) {
        if (tokens[i] instanceof lexer.TTSemi) {
            semi_indexes.push(i)
        }
    }

    semi_indexes.push(tokens.length)

    let start_idx = 0
    for (let semi_index of semi_indexes) {
        rv = undefined

        let working_tokens = tokens.slice(start_idx, semi_index)

        let pipe_start_idx = 0
        let pipe_indexes = []
        for (let i = 0; i < working_tokens.length; i++) {
            if (working_tokens[i] instanceof lexer.TTPipe) {
                pipe_indexes.push(i)
            }
        }
        pipe_indexes.push(working_tokens.length)

        if (runtime_opts.get("typing", false)) {
            await msg.channel.sendTyping()
        }

        for (let pipe_idx of pipe_indexes) {

            let pipe_working_tokens = working_tokens.slice(pipe_start_idx, pipe_idx)

            if (rv) {
                symbols.set("stdin:%", rv.content ?? "")
            }
            else {
                symbols.delete("stdin:%")
            }

            let evalulator = new tokenEvaluator.TokenEvaluator(pipe_working_tokens, symbols, msg)
            let new_tokens = await evalulator.evaluate()
            rv = await runner.command_runner(new_tokens, msg, runtime_opts, rv, sendCallback) as CommandReturn
            pipe_start_idx = pipe_idx + 1
        }
        if (!runtime_opts.get("silent", false) && rv && semi_index != semi_indexes[semi_indexes.length - 1]) {
            await handleSending(msg, rv)
        }
        start_idx = semi_index + 1
    }
    if (runtime_opts.get("silent", false)) {
        return { noSend: true, status: StatusCode.RETURN }
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
