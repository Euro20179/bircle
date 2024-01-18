import { Message } from 'discord.js'
import lexer from './lexer'
import tokenEvaluator from './token-evaluator'

function runcmd(command: string, prefix: string, msg: Message){
    let modifiers = lexer.getModifiers(command)

    let lex = new lexer.Lexer(command, {
        prefix
    })
    let tokens = lex.lex()
    let evalulator = new tokenEvaluator.TokenEvaluator(tokens, msg)
    let new_tokens = evalulator.evaluate()
    return new_tokens
}

export default {
    runcmd
}
