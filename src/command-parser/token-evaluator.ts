import { Message } from 'discord.js'
import { safeEval } from '../util'
import cmds from './cmds'
import { SymbolTable } from './cmds'
import lexer, { TT } from './lexer'


/**
    * @description This class takes a list of tokens, and as necessary expands them into string tokens.
    * @description By the end, all tokens should be string tokens where each string represents 1 arg
*/
class TokenEvaluator {
    public new_tokens: TT<any>[]
    constructor(public tokens: TT<any>[], private symbols: SymbolTable, private msg: Message){
        this.new_tokens = []
    }
    evaluate(){
        for(let token of this.tokens){
            if(token instanceof lexer.TTPipe || token instanceof lexer.TTSemi){
                break
            }
            else if(token instanceof lexer.TTJSExpr){
                let lex = new lexer.Lexer(token.data, {
                    is_command: false
                })
                let tokens = lex.lex()
                let evaulator = new TokenEvaluator(tokens, this.symbols, this.msg)
                let evauluated_tokens = evaulator.evaluate()
                let text = ""
                for(let t of evauluated_tokens){
                    text += t.data + " "
                }
                let new_text = String(safeEval(text, {}, {}))
                this.new_tokens.push(new lexer.TTString(new_text, token.start, token.end))
            }
            else if (token instanceof lexer.TTDoFirst){
                //(PREFIX) could be really anything, it just has to be something
                let tokens = cmds.runcmd(`(PREFIX)${token.data}`, "(PREFIX)", this.msg)
                this.new_tokens.push(new lexer.TTString(JSON.stringify(tokens), token.start, token.end))
            }
            else if(token instanceof lexer.TTString){
                this.new_tokens.push(token)
            }
            else if(token instanceof lexer.TTSemi){
                
            }
        }
        return this.new_tokens
    }
}

export default {
    TokenEvaluator
}
