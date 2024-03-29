import fs from 'fs'
import { Message, MessageCreateOptions, MessagePayload } from 'discord.js'
import lexer, { TT } from './lexer'
import runner from './runner'
import tokenEvaluator from './token-evaluator'
import { isMsgChannel, mimeTypeToFileExtension } from '../util'
import common_to_commands, { StatusCode, isCmd } from '../common_to_commands'

import configManager from '../config-manager'
import userOptions, { getOpt } from '../user-options'
import parser from './parser'

import { RECURSION_LIMIT } from '../config-manager'

const PREFIX = configManager.PREFIX

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

type RuntimeOptionValue = {
    silent: boolean,
    stdin: CommandReturn,
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
    ["no-run"]: boolean,
    disable: { categories?: CommandCategory[], commands?: string[] } | false
    "no-send": boolean,
}

type RuntimeOption = keyof RuntimeOptionValue

export class RuntimeOptions {
    public options: Record<RuntimeOption, RuntimeOptionValue[keyof RuntimeOptionValue]>
    constructor(
        options?: Record<RuntimeOption,
            RuntimeOptionValue[keyof RuntimeOptionValue]>,
        set_default_opts?: boolean
    ) {
        this.options = options ?? {} as RuntimeOptions['options']
        if (set_default_opts !== false) {
            this.set("recursion_limit", RECURSION_LIMIT)
            this.set("recursion", 0)
        }
    }
    get<T extends RuntimeOption, Y = RuntimeOptionValue[T]>(
        option: T,
        default_: RuntimeOptionValue[T] | Y
    ): RuntimeOptionValue[T] {
        return this.options[option] as RuntimeOptionValue[T] ?? default_
    }
    set<T extends RuntimeOption>(option: T, value: RuntimeOptionValue[T]) {
        this.options[option] = value
    }

    delete(option: RuntimeOption) {
        if (option in this.options)
            delete this.options[option]
    }

    copy() {
        let copy = new RuntimeOptions()
        for (let key in this.options) {
            //@ts-ignore
            copy.options[key] = this.options[key]
        }
        return copy
    }
}

async function* handlePipe(
    tokens: TT<any>[],
    pipeChain: TT<any>[][],
    msg: Message,
    symbols: SymbolTable,
    runtime_opts: RuntimeOptions,
    sendCallback?: ((options: MessageCreateOptions | MessagePayload | string) => Promise<Message>),
    pid_label?: string
): AsyncGenerator<CommandReturn> {
    let stdin = runtime_opts.get("stdin", null)
    if (stdin) {
        symbols.set("stdin:content", stdin.content ?? "")
        symbols.set("stdin:%", stdin.content ?? "")
        symbols.set("stdin:status", stdin.status)
    }
    else {
        symbols.delete("stdin:%")
        symbols.delete("stdin:status")
    }

    let evaulator = new tokenEvaluator.TokenEvaluator(tokens, symbols, msg, runtime_opts)

    let new_tokens = await evaulator.evaluate()

    let modifier_dat = lexer.getModifiers(new_tokens[0].data)

    new_tokens[0].data = modifier_dat[0]

    for (let mod of modifier_dat[1]) {
        mod.set_runtime_opt(runtime_opts)
    }

    let pipe_to = pipeChain.slice(1)

    for await (let item of runner.command_runner(
        new_tokens,
        msg,
        symbols,
        runtime_opts,
        stdin,
        sendCallback,
        pid_label as string
    )) {
        if (runtime_opts.get("no-send", false)) {
            item.noSend = true
        }
        //although this could technically be done in the command_runner it's simply easier to do it here
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

            runtime_opts.set("stdin", item)

            //pipe this result to the next pipe in the chain
            yield* handlePipe(
                pipeChain[0],
                pipe_to,
                msg,
                symbols,
                runtime_opts,
                sendCallback,
                pid_label
            )

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
    runtime_opts?: RuntimeOptions,
    pid_label?: string,
    symbols?: SymbolTable,
}

async function* runcmdlinev2({
    tokens,
    msg,
    sendCallback,
    runtime_opts,
    pid_label,
    symbols,
    line_no,
}: {
    tokens: TT<any>[][],
    msg: Message,
    sendCallback?: RunCmdOptions['sendCallback'],
    symbols: SymbolTable,
    runtime_opts: RuntimeOptions,
    line_no: number,
    pid_label?: string,
}) {
    symbols.set("LINENO", String(line_no))
    if (runtime_opts.get("verbose", false)) {
        let text = ""
        for(let pipe_line of tokens){
            let pipe_line_text = ""
            for(let token of pipe_line){
                pipe_line_text += token.data
            }
            text += pipe_line_text.trim() + " >pipe> "
        }
        text = text.slice(0, text.length - " >pipe> ".length)
        yield { content: text, status: StatusCode.INFO }
        // console.log(tokens)
        // yield { content: "Work in progress", status: StatusCode.INFO }
    }

    try {
        if (runtime_opts.get("no-run", false)) {
            return
        }
        for await (let result of handlePipe(
            tokens[0],
            tokens.slice(1),
            msg,
            symbols,
            runtime_opts,
            sendCallback,
            pid_label
        )) {
            if (result.recurse
                && result.content
                && isCmd(result.content, PREFIX)
                && runtime_opts.get("recursion", 1) < runtime_opts.get("recursion_limit", RECURSION_LIMIT)
            ) {
                let old_disable = runtime_opts.get('disable', false)
                if (typeof result.recurse === 'object') {
                    result.recurse.categories ??= []
                    result.recurse.commands ??= []
                    runtime_opts.set("disable", result.recurse)
                }
                yield* runcmdv2({ command: result.content, prefix: PREFIX, msg, runtime_opts, symbols })
                runtime_opts.set("disable", old_disable)
                continue
            }
            yield result
        }
    }
    catch (err: any) {
        yield { content: common_to_commands.censor_error(err.toString()), status: StatusCode.ERR }
    }
}

async function* runcmdv2({
    command,
    prefix,
    msg,
    sendCallback,
    runtime_opts,
    pid_label,
    symbols,
}: RunCmdOptions): AsyncGenerator<CommandReturn> {
    console.log(`Running cmd: ${command} ${new Date()} with runcmdV2`)
    console.assert(pid_label !== undefined, "Pid label is undefined")

    runtime_opts ??= new RuntimeOptions()

    //this is a special case modifier that basically has to happen here
    if (command.startsWith(`${prefix}n:`)) {
        runtime_opts.set("skip", true)
        command = command.slice(2)
    }
    runtime_opts.set("recursion", runtime_opts.get("recursion", 0) + 1)

    if (runtime_opts.get("recursion", 0) > runtime_opts.get("recursion_limit", RECURSION_LIMIT)) {
        return common_to_commands.cre("Recursion limit reached")
    }


    symbols ??= new SymbolTable()

    let enable_arg_string = userOptions.getOpt(msg.author.id, "1-arg-string", false)

    let lex = new lexer.Lexer(command, {
        prefix,
        skip_parsing: runtime_opts.get("skip", false),
        pipe_sign: getOpt(msg.author.id, "pipe-symbol", ">pipe>"),
        enable_1_arg_string: enable_arg_string === 'true' ? true : false
    })

    let cmd = parser.createCommandFromTokens(lex.gen_tokens())


    let lineNo = 1
    for (let cmdLine of cmd) {
        yield* runcmdlinev2({
            tokens: cmdLine,
            msg,
            sendCallback,
            line_no: lineNo,
            pid_label,
            symbols,
            runtime_opts,
        })
    }

    runtime_opts.set("recursion", runtime_opts.get("recursion", 0) - 1)

    return { noSend: true, status: 0 }
}

async function handleSending(
    msg: Message,
    rv: CommandReturn,
    sendCallback?: (data: MessageCreateOptions | MessagePayload | string) => Promise<Message>
): Promise<Message> {
    if (!isMsgChannel(msg.channel)) return msg

    if (!Object.keys(rv).length) {
        return msg
    }

    if (!sendCallback) {
        sendCallback = rv.sendCallback || (rv.reply ? msg.reply.bind(msg) :
            rv.channel?.send.bind(rv.channel) ||
            msg.channel.send.bind(msg.channel))
    }

    if (rv.delete) {
        msg.delete().catch(console.error)
    }

    if (rv.noSend) {
        return msg
    }

    if (!rv?.content) {
        //if content is empty string, delete it so it shows up as undefined to discord
        //so it wont bother trying to send an empty string
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
        rv.files = (rv.files ?? []).concat([{
            attachment: fn,
            name: `cmd.${extension}`,
            description: "command output too long",
            wasContent: oldContent
        }])
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

async function expandSyntax(bircle_string: string, msg: Message, symbols?: SymbolTable, runtime_opts?: RuntimeOptions) {
    let tokens = new lexer.Lexer(bircle_string, {
        is_command: false,
        pipe_sign: getOpt(msg.author.id, "pipe-symbol", ">pipe>")
    }).lex()

    let symbolTable = symbols ?? new SymbolTable()
    let runtimeOpts = runtime_opts ?? new RuntimeOptions()

    let ev = new tokenEvaluator.TokenEvaluator(tokens, symbolTable, msg, runtimeOpts)
    let new_toks = await ev.evaluate()
    let strs: string[] = []
    for (let tok of new_toks) {
        if (!(tok instanceof lexer.TTIFS))
            strs.push(tok.data)
    }
    return strs
}

export default {
    handleSending,
    SymbolTable,
    RuntimeOptions,
    expandSyntax,
    runcmdv2,
}
