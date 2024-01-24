import fs from 'fs'
import { Message, MessageCreateOptions, MessagePayload } from 'discord.js'
import lexer, { TT } from './lexer'
import runner from './runner'
import tokenEvaluator from './token-evaluator'
import { isMsgChannel, mimeTypeToFileExtension } from '../util'
import common_to_commands, { StatusCode, isCmd } from '../common_to_commands'

import { PREFIX, RECURSION_LIMIT } from '../globals'
import userOptions, { getOpt } from '../user-options'

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

type RuntimeOption =
    "silent"
    | "remote"
    | "skip"
    | "typing"
    | "delete"
    | "command"
    | "alias"
    | "legacy"
    | "recursion_limit"
    | "recursion"
    | "program-args"
    | "verbose"
    | "no-run"
    | "disable"
    | "no-send" //this is similar to silent, but instead of yielding { noSend: true, status: 0 }
//it just adds noSend: true to whatever object it got
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
    ["no-run"]: boolean,
    disable: { categories?: CommandCategory[], commands?: string[] } | false
    "no-send": boolean
}

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
    get<T extends RuntimeOption>(
        option: T,
        default_: RuntimeOptionValue[T]
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
            copy[key] = this.options[key]
        }
        return copy
    }
}

async function* handlePipe(
    stdin: CommandReturn | undefined,
    tokens: TT<any>[],
    pipeChain: TT<any>[][],
    msg: Message,
    symbols: SymbolTable,
    runtime_opts: RuntimeOptions,
    sendCallback?: ((options: MessageCreateOptions | MessagePayload | string) => Promise<Message>),
    pid_label?: string
): AsyncGenerator<CommandReturn> {
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

            //pipe this result to the next pipe in the chain
            yield* handlePipe(
                item,
                pipeChain[0],
                pipeChain.slice(1),
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
}

type RunCmdLineOptions = {
    line_tokens: TT<any>[],
    msg: Message,
    sendCallback?: RunCmdOptions['sendCallback'],
    symbols: SymbolTable,
    runtime_opts: RuntimeOptions,
    line_no: number,
    pid_label?: string
}

async function* runcmdline({
    line_tokens: tokens,
    msg,
    sendCallback,
    runtime_opts,
    pid_label,
    symbols,
    line_no
}: RunCmdLineOptions): AsyncGenerator<CommandReturn> {
    symbols.set("LINENO", String(line_no))

    if (runtime_opts.get("verbose", false)) {
        yield { content: tokens.map(v => v.data).join(" "), status: StatusCode.INFO }
    }

    let pipe_indexes = []
    for (let i = 0; i < tokens.length; i++) {
        if (tokens[i] instanceof lexer.TTPipe) {
            pipe_indexes.push(i)
        }
    }
    pipe_indexes.push(tokens.length)

    let pipe_token_chains = []
    let last_pipe_idx = 0
    for (let idx of pipe_indexes) {
        pipe_token_chains.push(tokens.splice(0, idx - last_pipe_idx))
        //remove the pipe token
        tokens.splice(0, 1)
        last_pipe_idx = idx
    }

    try {
        if (runtime_opts.get("no-run", false)) {
            return
        }
        for await (let result of handlePipe(
            undefined,
            pipe_token_chains[0],
            pipe_token_chains.slice(1),
            msg,
            symbols,
            runtime_opts,
            sendCallback,
            pid_label as string
        )) {
            //this is done here because recursion should be handled per line (;; seperated commands), not per the ENTIRE command, or per pipe
            if (result.recurse
                && result.content
                && isCmd(result.content, PREFIX)
                && runtime_opts.get("recursion", 1) < runtime_opts.get("recursion_limit", RECURSION_LIMIT)
            ) {
                let old_disable = runtime_opts.get('disable', false)
                if (typeof result.recurse === 'object') {
                    result.recurse.categories ??= []
                    result.recurse.commands ??= []
                    runtime_opts.set('disable', result.recurse)
                }
                yield* runcmd({ command: result.content, prefix: PREFIX, msg, runtime_opts })
                runtime_opts.set('disable', old_disable)
                continue
            }
            yield result
        }
    } catch (err: any) {
        yield { content: common_to_commands.censor_error(err.toString()), status: StatusCode.ERR }
    }
}

//TODO:
//missing support for:
//banned_commands
async function* runcmd({
    command,
    prefix,
    msg,
    sendCallback,
    runtime_opts,
    pid_label
}: RunCmdOptions): AsyncGenerator<CommandReturn> {
    console.assert(pid_label !== undefined, "Pid label is undefined")

    runtime_opts ??= new RuntimeOptions()

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

    let enable_arg_string = userOptions.getOpt(msg.author.id, "1-arg-string", false)

    let lex = new lexer.Lexer(command, {
        prefix,
        skip_parsing: runtime_opts.get("skip", false),
        pipe_sign: getOpt(msg.author.id, "pipe-symbol", ">pipe>"),
        enable_1_arg_string: enable_arg_string === 'true' ? true : false
    })

    let line_no = 1
    let generator = lex.gen_tokens()
    do {
        let tokens = []
        let cur_tok
        while (!((cur_tok = generator.next()).value instanceof lexer.TTSemi) && cur_tok.value) {
            tokens.push(cur_tok.value)
            if (cur_tok.done) {
                break
            }
        }
        yield* runcmdline({
            line_tokens: tokens,
            msg,
            sendCallback,
            runtime_opts,
            pid_label,
            symbols,
            line_no
        })
        line_no++
    } while (!lex.done)
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

async function expandSyntax(bircle_string: string, msg: Message) {
    let tokens = new lexer.Lexer(bircle_string, {
        is_command: false,
        pipe_sign: getOpt(msg.author.id, "pipe-symbol", ">pipe>")
    }).lex()

    let symbolTable = new SymbolTable()
    let runtimeOpts = new RuntimeOptions()

    let ev = new tokenEvaluator.TokenEvaluator(tokens, symbolTable, msg, runtimeOpts)
    let new_toks = await ev.evaluate()
    let strs: string[] = []
    for (let tok of new_toks) {
        if (tok instanceof lexer.TTIFS)
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
    expandSyntax,
}
