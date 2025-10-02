import fs from 'fs'
import { Message, MessageCreateOptions, MessagePayload } from 'discord.js'
import lexer, { TT } from './lexer'
import runner from './runner'
import tokenEvaluator from './token-evaluator'
import { getContentFromResult, isMsgChannel, mimeTypeToFileExtension, sleep } from '../util'
import common_to_commands, { StatusCode, isCmd } from '../common_to_commands'

import configManager from '../config-manager'
import userOptions, { getOpt } from '../user-options'
import parser, { LineNode, LogicNode, PipeNode } from './parser'

import { RECURSION_LIMIT } from '../config-manager'
import { PROCESS_MANAGER } from '../globals'

const PREFIX = configManager.PREFIX

export class SymbolTable {
    symbols: Record<string, string | (() => AsyncGenerator<CommandReturn>)>
    constructor() {
        this.symbols = {}
    }
    set(name: string, value: string | (() => AsyncGenerator<CommandReturn>)) {
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
    allowPings: boolean,
    disableCmdConfirmations: boolean,
    optsParser: "with-negate" | "unix" | "normal" | ""
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

export type RunCmdOptions = {
    command: string,
    prefix: string,
    msg: Message,
    sendCallback?: ((options: MessageCreateOptions | MessagePayload | string) => Promise<Message>),
    runtime_opts?: RuntimeOptions,
    pid_label?: string,
    symbols?: SymbolTable,
    or_sign?: string,
    and_sign?: string,
    pipe_sign?: string,
    one_arg_str?: boolean
}

async function* runcmdpipe(pipes: PipeNode[],
    msg: Message,
    symbols: SymbolTable,
    runtime_opts: RuntimeOptions,
    sendCallback?: ((options: MessageCreateOptions | MessagePayload | string) => Promise<Message>),
    pid_label?: string
): AsyncGenerator<CommandReturn> {
    //we set this up here because we need access to stdin:* BEFORE tokens get parsed
    //if the r: modifier is set, these symbols will still exist
    //that's not a problem because the user opted into using them
    let stdin = runtime_opts.get("stdin", null)
    if (stdin) {
        symbols.set("stdin:content", stdin.content ?? "")
        symbols.set("stdin:%", stdin.content ?? "")
        symbols.set("stdin:content%", getContentFromResult(stdin) ?? "")
        symbols.set("stdin:raw", JSON.stringify(stdin))
        if (stdin.status === StatusCode.CMDSTATUS) {
            symbols.set("stdin:status", String(stdin.statusNr || 0))
        } else {
            symbols.set("stdin:status", stdin.status)
        }
    }
    else {
        symbols.delete("stdin:%")
        symbols.delete("stdin:status")
    }

    if (pid_label) {
        symbols.set("PID", String(PROCESS_MANAGER.getprocidFromLabel(pid_label)) || "UNKNOWN")
    }

    //parse tokens after because we need them to get the modifier
    //since we do this before modifiers, {%} will still work if stdin exists
    //this is consistent with the ${stdin:*} variables
    let evaulator = new tokenEvaluator.TokenEvaluator(pipes[0].tokens, symbols, msg, runtime_opts)

    let new_tokens = await evaulator.evaluate()

    let modifier_dat = lexer.getModifiers(new_tokens[0].data.trim())

    new_tokens[0].data = modifier_dat[0]

    //run this before getting stdin as it has a chance of removing stdin
    for (let mod of modifier_dat[1]) {
        mod.set_runtime_opt(runtime_opts)
    }

    //if we are silent, sendCallback should be silent
    if(runtime_opts.get("silent", false)) {
        sendCallback = async(options) => msg
    }

    //modifiers might have removed stdin
    stdin = runtime_opts.get("stdin", null)

    let pipeChain = pipes.slice(1)

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
            item.noSend == true
        }
        if(runtime_opts.get("allowPings", false)){
            item["allowedMentions"] = {
                parse: ["users"]
            }
        }
        //although this could technically be done in the command_runner it's simply easier to do it here
        if (runtime_opts.get("silent", false)) {
            console.log(item)
            yield { noSend: true, status: item.status, statusNr: item.statusNr }
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
            yield* runcmdpipe(
                pipeChain,
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

async function* runcmdlogicline2({
    tree,
    msg,
    sendCallback,
    runtime_opts,
    pid_label,
    symbols,
    success
}: {
    tree: LogicNode,
    msg: Message,
    sendCallback?: RunCmdOptions['sendCallback'],
    symbols: SymbolTable,
    runtime_opts: RuntimeOptions,
    pid_label?: string,
    success?: boolean
}): AsyncGenerator<CommandReturn> {
    if(success !== false && tree.logic !== parser.logicType.Or){
        for await (let res of runcmdpipe(tree.todo, msg, symbols, runtime_opts, sendCallback, pid_label)) {
            success = res.status === StatusCode.RETURN
            yield res
        }
    } else if(success === false && tree.logic !== parser.logicType.And){
        for await (let res of runcmdpipe(tree.todo, msg, symbols, runtime_opts, sendCallback, pid_label)) {
            success = res.status === StatusCode.RETURN
            yield res
        }
    }
    if(tree.next.length){
        yield* runcmdlogicline2({
            tree: tree.next[0],
            msg,
            sendCallback,
            runtime_opts,
            pid_label,
            symbols,
            success
        })
    }
}

async function* runcmdline({
    tree,
    msg,
    sendCallback,
    runtime_opts,
    pid_label,
    symbols,
    line_no,
}: {
    tree: LineNode,
    msg: Message,
    sendCallback?: RunCmdOptions['sendCallback'],
    symbols: SymbolTable,
    runtime_opts: RuntimeOptions,
    line_no: number,
    pid_label?: string,
}) {
    symbols.set("LINENO", String(line_no))
    if (runtime_opts.get("verbose", false)) {
        yield { content: tree.sprint(), status: StatusCode.INFO }
    }

    try {
        if (runtime_opts.get("no-run", false)) {
            return
        }

        for(const logic of tree.childs){
            for await (let result of runcmdlogicline2({
                tree: logic,
                msg,
                symbols,
                runtime_opts,
                pid_label,
                sendCallback
            })) {
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
    }
    catch (err: any) {
        console.error(err)
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
    pipe_sign,
    and_sign,
    or_sign,
    one_arg_str
}: RunCmdOptions): AsyncGenerator<CommandReturn> {
    console.log(`Running cmd: ${command} ${new Date()} with runcmdV2`)
    console.assert(pid_label !== undefined, "Pid label is undefined")

    runtime_opts ??= new RuntimeOptions()

    runtime_opts.set("recursion", runtime_opts.get("recursion", 0) + 1)

    if (runtime_opts.get("recursion", 0) >= runtime_opts.get("recursion_limit", RECURSION_LIMIT)) {
        yield common_to_commands.cre("Recursion limit reached")
        return
    }

    symbols ??= new SymbolTable()

    symbols.set("RECURSION", String(runtime_opts.get("recursion", 1)))

    let enable_arg_string = one_arg_str ?? userOptions.getOpt(msg.author.id, "1-arg-string", false)

    //this is a special case modifier that basically has to happen here
    if (command.startsWith(`${prefix}n:`)) {
        runtime_opts.set("skip", true)
        command = command.slice(2)
    }

    let lex = new lexer.Lexer(command, {
        prefix,
        skip_parsing: runtime_opts.get("skip", false),
        pipe_sign: pipe_sign || getOpt(msg.author.id, "pipe-symbol", ">pipe>"),
        and_sign: and_sign || getOpt(msg.author.id, "and-symbol", ">and>"),
        or_sign: or_sign || getOpt(msg.author.id, "or-symbol", ">or>"),
        enable_1_arg_string: enable_arg_string === 'true' ? true : false
    })

    const p = new parser.Parser(lex.gen_tokens())

    const tree = p.buildCommandTree()

    let lineNo = 1
    for (let child of tree.childs) {
        yield* runcmdline({
            tree: child,
            runtime_opts,
            symbols,
            msg,
            sendCallback,
            line_no: lineNo,
            pid_label
        })
        lineNo++
    }
    runtime_opts.set("recursion", runtime_opts.get("recursion", 0) - 1)

    return { noSend: true, status: 0 }

}

async function handleSending(
    msg: Message,
    rv: CommandReturn,
    sendCallback?: (data: MessageCreateOptions | MessagePayload | string) => Promise<Message>
): Promise<Message> {
    //this status is specifically for a command to checkin with the process manager
    //so that if necessary the process manager can stop the command
    if (rv.status === StatusCode.CHECKIN) return msg
    if (!isMsgChannel(msg.channel)) return msg

    if (!Object.keys(rv).length) {
        return msg
    }

    if (rv.content?.startsWith(PREFIX)) {
        rv.content = `\\${rv.content}`
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
        //this microsleep is because
        //If a command infinitely yields {noSend: true} without actually sending content
        //it will hang the bot as the javascript eventloop will not run anything else
        //to fix this, add a microsleep to allow the js eventloop do do other things
        //
        //an example of the scenario described above:
        //user runs `for i 1..Infinity { s:coin }`
        //without the microsleep, no one can run `stop` as the js eventloop is not processing other events
        //with the microsleep, the js eventloop can do other things (like process the `stop` command)
        await sleep(0)
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
