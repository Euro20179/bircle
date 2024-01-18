import fs from 'fs'
import { Message, MessageCreateOptions, MessagePayload } from 'discord.js'
import lexer from './lexer'
import runner from './runner'
import tokenEvaluator from './token-evaluator'
import { isMsgChannel, mimeTypeToFileExtension } from '../util'
import { StatusCode } from '../common_to_commands'

export class SymbolTable {
    symbols: Record<string, string>
    constructor(){
        this.symbols = {}
    }
    set(name: string, value: string){
        this.symbols[name] = value
    }
    get(name: string){
        return this.symbols[name] || `(${name}:UNDEFINED)`
    }
}

async function runcmd(command: string, prefix: string, msg: Message){
    let modifiers = lexer.getModifiers(command)

    let symbols = new SymbolTable()

    let lex = new lexer.Lexer(command, {
        prefix
    })
    let rv: CommandReturn = { content: `\\${command} EXECUTED`, status: StatusCode.INFO }
    while(true) {
        let tokens = lex.lex()
        let index_of_semi = tokens.findIndex(val => val instanceof lexer.TTSemi)
        let cmd_tokens =  index_of_semi !== -1 ? tokens.slice(0, index_of_semi) : tokens
        let evalulator = new tokenEvaluator.TokenEvaluator(cmd_tokens, symbols, msg)
        let new_tokens = evalulator.evaluate()
        rv = await runner.command_runner(new_tokens, msg)
        if(index_of_semi !== -1){
            await handleSending(msg, rv)
        }
        else {
            break
        }
        lex = new lexer.Lexer(`${prefix}${tokens[index_of_semi + 1].data.trim()}`, {
            prefix
        })
    }
    return rv
    return await runner.command_runner(new_tokens, msg)
}

async function handleSending(msg: Message, rv: CommandReturn, sendCallback?: (data: MessageCreateOptions | MessagePayload | string) => Promise<Message>, recursion = 0): Promise<Message> {
    if (!isMsgChannel(msg.channel)) return msg

    if (!Object.keys(rv).length) {
        return msg
    }

    if(!sendCallback){
        sendCallback = rv.sendCallback || rv.reply ? msg.reply.bind(msg) :
            rv.channel?.send.bind(rv.channel) ||
            msg.channel.send.bind(msg.channel)
    }

    if(rv.delete){
        msg.delete().catch(console.error)
    }

    if(rv.noSend){
        return msg
    }

    if(!rv?.content){
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
        if(rv.silent !== true){
            newMsg = await sendCallback(rv as MessageCreateOptions)
        }
    }
    catch(err){
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
