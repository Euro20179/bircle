import { Message } from 'discord.js'
import { safeEval } from '../util'
import cmds from './cmds'
import { SymbolTable } from './cmds'
import lexer, { TT } from './lexer'
import { escape } from 'querystring'


/**
    * @description This class takes a list of tokens, and as necessary expands them into string tokens.
    * @description By the end, all tokens should be string tokens where each string represents 1 arg
*/
class TokenEvaluator {
    public new_tokens: TT<any>[]
    constructor(public tokens: TT<any>[], private symbols: SymbolTable, private msg: Message) {
        this.new_tokens = []
    }
    async evaluate() {
        let char_pos = 0
        let cur_tok = new lexer.TTString("", 0, 0)
        for (let token of this.tokens) {
            if (token instanceof lexer.TTPipe || token instanceof lexer.TTSemi) {
                break
            }
            else if (token instanceof lexer.TTJSExpr) {
                let lex = new lexer.Lexer(token.data, {
                    is_command: false
                })
                let tokens = lex.lex()
                let evaulator = new TokenEvaluator(tokens, this.symbols, this.msg)
                let evauluated_tokens = await evaulator.evaluate()
                let text = ""
                for (let t of evauluated_tokens) {
                    text += t.data + " "
                }
                let new_text = String(safeEval(text, {}, {}))
                cur_tok.data += new_text
                char_pos += new_text.length
                // this.new_tokens.push(new lexer.TTString(new_text, token.start, token.end))
            }
            else if (token instanceof lexer.TTDoFirst) {
                //(PREFIX) could be really anything, it just has to be something
                let tokens = cmds.runcmd(`(PREFIX)${token.data}`, "(PREFIX)", this.msg)
                let data = JSON.stringify(tokens)
                cur_tok.data += data
                char_pos += data.length
                // this.new_tokens.push(new lexer.TTString(JSON.stringify(tokens), token.start, token.end))
            }
            else if (token instanceof lexer.TTString) {
                cur_tok.data += token.data
                char_pos += token.data.length
                // this.new_tokens.push(token)
            }
            else if (token instanceof lexer.TTFormat) {
                let str = token.data
                if (format_parsers[token.data]) {
                    str = await format_parsers[token.data](token, this.symbols, this.msg)
                }
                cur_tok.data += str
                char_pos += str.length
                // this.new_tokens.push(new lexer.TTString(str, token.start, token.end))
            }
            else if (token instanceof lexer.TTIFS) {
                cur_tok.end = char_pos
                this.new_tokens.push(cur_tok)
                cur_tok = new lexer.TTString("", char_pos, char_pos)
            }
            else if(token instanceof lexer.TTEsc){
                let char = token.data[0]
                let str = ""
                if(esc_parsers[char]){
                    str = await esc_parsers[char](token, this.symbols)
                }
                cur_tok.data += str
                char_pos += str.length
            }
        }
        if (cur_tok.data) {
            cur_tok.end = char_pos
            this.new_tokens.push(cur_tok)
        }
        if(this.new_tokens[0] && this.new_tokens[0].start == 0 && this.new_tokens[0].end == 0 && this.new_tokens[0].data == ""){
            this.new_tokens = this.new_tokens.slice(1)
        }
        return this.new_tokens
    }
}

const format_parsers: Record<string, (token: TT<any>, symbols: SymbolTable, msg: Message) => Promise<string>> = {
    ["%"]: async (_token, symbols) => {
        return symbols.get("stdin:%") ?? "{%}"
    },
}

const esc_parsers: Record<string, (token: TT<[string, string]>, symbols: SymbolTable) => Promise<string>> = {
    "n": async(token, _) => {
        return "\n"
    }
}

export default {
    TokenEvaluator
}
