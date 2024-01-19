import fs from 'fs'
import { Message, MessageCreateOptions, MessagePayload } from 'discord.js'
import lexer, { TT } from './lexer'
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
        return this.symbols[name]
    }

    delete(name: string) {
        if (this.symbols[name] !== undefined)
            delete this.symbols[name]
    }
}

type RuntimeOption = "silent" | "remote" | "skip" | "typing" | "delete" | "command" | "alias" | "legacy" | "recursion_limit" | "recursion" | "program-args" | "verbose"
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
    recursion: number,
    verbose: boolean,
    ["program-args"]: string[]
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

    delete(option: RuntimeOption) {
        if (option in this.options)
            delete this.options[option]
    }
}

async function* handlePipe(stdin: CommandReturn | undefined, tokens: TT<any>[], pipeChain: TT<any>[][], msg: Message, symbols: SymbolTable, runtime_opts: RuntimeOptions, sendCallback?: ((options: MessageCreateOptions | MessagePayload | string) => Promise<Message>)): AsyncGenerator<CommandReturn> {
    if (stdin) {
        symbols.set("stdin:%", stdin.content ?? "")
    }
    else {
        symbols.delete("stdin:%")
    }

    let evaulator = new tokenEvaluator.TokenEvaluator(tokens, symbols, msg, runtime_opts)

    let new_tokens = await evaulator.evaluate()

    let modifier_dat = lexer.getModifiers(new_tokens[0].data)

    new_tokens[0].data = modifier_dat[0]

    for (let mod of modifier_dat[1]) {
        mod.set_runtime_opt(runtime_opts)
    }

    if (runtime_opts.get("typing", false)) {
        await msg.channel.sendTyping()
    }

    if (runtime_opts.get("delete", false) && msg.deletable) {
        msg.delete().catch(console.error)
    }

    for await (let item of runner.command_runner(new_tokens, msg, symbols, runtime_opts, stdin, sendCallback)) {
        if (runtime_opts.get("silent", false)) {
            yield { noSend: true, status: StatusCode.RETURN }
        }
        //there will always be at least one item in the pipe chain (if there is 1, that is the one we are on)
        else if (pipeChain.length == 0) {
            yield item ?? { noSend: true, status: StatusCode.RETURN }
        }
        else {
            for (let modifier of modifier_dat[1]) {
                modifier.unset_runtime_opt(runtime_opts)
            }
            for await (let piped_item of handlePipe(item, pipeChain[0], pipeChain.slice(1), msg, symbols, runtime_opts, sendCallback)) {
                yield piped_item
            }
            for (let mod of modifier_dat[1]) {
                mod.set_runtime_opt(runtime_opts)
            }
        }
    }
    for (let modifier of modifier_dat[1]) {
        modifier.unset_runtime_opt(runtime_opts)
    }

}


export type RunCmdOptions = {
    command: string,
    prefix: string,
    msg: Message,
    sendCallback?: ((options: MessageCreateOptions | MessagePayload | string) => Promise<Message>),
    runtime_opts?: RuntimeOptions
}
//TODO:
//missing support for:
//recursion_count
//banned_commands
async function* runcmd({ command, prefix, msg, sendCallback, runtime_opts }: RunCmdOptions) {
    if (!runtime_opts) {
        runtime_opts = new RuntimeOptions()
        runtime_opts.set("recursion_limit", RECURSION_LIMIT)
        runtime_opts.set("recursion", 0)
    }

    //this is a special case modifier that basically has to happen here
    if (command.startsWith("n:")) {
        runtime_opts.set("skip", true)
        command = command.slice(2)
    }

    runtime_opts.set("recursion", runtime_opts.get("recursion", 0) + 1)

    if (runtime_opts.get("recursion", 0) > runtime_opts.get("recursion_limit", RECURSION_LIMIT)) {
        return { content: "Recursion limit reached", status: StatusCode.ERR }
    }


    let symbols = new SymbolTable()

    let lex = new lexer.Lexer(command, {
        prefix,
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
    for (let i = 0; i < semi_indexes.length; i++) {
        let semi_index = semi_indexes[i]
        symbols.set("LINENO", String(i + 1))
        let working_tokens = tokens.slice(start_idx, semi_index)

        //first token (presumably command) should be trimmed
        working_tokens[0].data = working_tokens[0].data.trim()

        let pipe_indexes = []
        for (let i = 0; i < working_tokens.length; i++) {
            if (working_tokens[i] instanceof lexer.TTPipe) {
                pipe_indexes.push(i)
            }
        }
        pipe_indexes.push(working_tokens.length)

        let pipe_token_chains = []
        let pipe_start_idx = 0
        for (let idx of pipe_indexes) {
            pipe_token_chains.push(working_tokens.slice(pipe_start_idx, idx))
            pipe_start_idx = idx + 1
        }

        if(runtime_opts.get("verbose", false)){
            yield { content: command.slice(working_tokens[0].start, working_tokens[working_tokens.length - 1].end + 1), status: StatusCode.INFO }
        }

        for await (let result of handlePipe(undefined, pipe_token_chains[0], pipe_token_chains.slice(1), msg, symbols, runtime_opts, sendCallback)) {
            yield result
        }
        start_idx = semi_index + 1
    }
    // return rv ?? { content: `\\${command}(NO MESSAGE)`, status: StatusCode.RETURN }
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

async function expandSyntax(bircle_string: string, msg: Message){
    let tokens = new lexer.Lexer(bircle_string, {
        is_command: false
    }).lex()

    let symbolTable = new SymbolTable()
    let runtimeOpts = new RuntimeOptions()

    let ev = new tokenEvaluator.TokenEvaluator(tokens, symbolTable, msg, runtimeOpts)
    let new_toks = await ev.evaluate()
    let strs: string[] = []
    for(let tok of new_toks){
        if(tok instanceof lexer.TTIFS)
            continue
        strs.push(tok.data)
    }
    return strs
}

export default {
    runcmd,
    handleSending,
    SymbolTable,
    RuntimeOptions,
    expandSyntax
}
