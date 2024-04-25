import vars from "./vars";
import { Interpreter } from "./common_to_commands";
import { Parser, T, Token } from "./parsing";

export default {
    ["escape_n"]: async (token: Token, _char: string, _sequence: string) => [new Token(T.str, "\n", token.argNo)],

    escape_t: async (token: Token, _char: string, _sequence: string) => [new Token(T.str, "\t", token.argNo)],

    escape_u: async (token: Token, _: string, sequence: string) => {
        if (!sequence) {
            return [new Token(T.str, "\\u", token.argNo)]
        }
        try {
            return [new Token(T.str, String.fromCodePoint(parseInt(`0x${sequence}`)), token.argNo)]
        }
        catch (err) {
            return [new Token(T.str, `\\u{${sequence}}`, token.argNo)]
        }
    },

    escape_U: async function(token, char, seq, int) {
        return this.escape_u(token, char, seq, int)
    },

    escape_s: async (token, _, seq) => {
        if (seq) {
            return [new Token(T.str, seq, token.argNo)]
        }
        return [new Token(T.str, " ", token.argNo)]
    },

    escape_y: async function(token, _char, seq, interpreter) {
        if (seq) {
            return await interpreter?.interpretAsToken(new Token(T.str, seq, token.argNo), T.syntax) as Token[]
        }
        return [new Token(T.str, " ", token.argNo)]
    },
    //this is different from \y because it splits the args whereas \y keeps everything as 1 arg

    escape_Y: async (_token, _, seq, int) => {
        let p = new Parser(int.getMessage(), seq)
        await p.parse()
        let i = new Interpreter(int.getMessage(), p.tokens, {
            modifiers: p.modifiers,
            recursion: int.recursion + 1
        })
        let args = (await i.interpret()).join(" ").split(" ")
        let toks = []
        for (let i = 0; i < args.length; i++) {
            toks.push(new Token(T.str, args[i], int.args.length + i))
        }
        return toks
    },

    escape_a: async (token, _, seq, int) => {
        if (seq === "*") {
            return [new Token(T.str, int.context.programArgs.join(int.context.env.IFS?.[0] || " "), token.argNo)]
        }
        else if (seq === "@") {
            return Array.from(int.context.programArgs, arg => new Token(T.str, arg, ++token.argNo))
        }
        else if (seq === "#") {
            return [new Token(T.str, String(int.context.programArgs.length), token.argNo)]
        }
        let n = Number(seq)
        if (!isNaN(n)) {
            return [new Token(T.str, int.context.programArgs[n] ?? "", token.argNo)]
        }
        return []
    },

    escape_A: async (token, _, seq) => {
        if (seq) {
            return Array.from(seq, item => new Token(T.str, item, ++token.argNo))
        }
        return [new Token(T.str, "", token.argNo)]
    },

    escape_b: async (token, _char, sequence) => [new Token(T.str, `**${sequence}**`, token.argNo)],

    escape_i: async (token, _char, sequence) => [new Token(T.str, `*${sequence}*`, token.argNo)],

    escape_S: async (token, _char, sequence) => [new Token(T.str, `~~${sequence}~~`, token.argNo)],

    escape_d: async (token, _char, sequence) => {
        let date = new Date(sequence)
        if (date.toString() === "Invalid Date") {
            if (sequence) {
                return [new Token(T.str, `\\d{${sequence}}`, token.argNo)]
            }
            else {
                return [new Token(T.str, `\\d`, token.argNo)]
            }
        }
        return [new Token(T.str, date.toString(), token.argNo)]
    },

    escape_D: async function(_token, _, seq): Promise<Token[]> { return (this['d'] as Function)(_, seq) },

    escape_T: async function(token, _char, sequence) {
        let ts = Date.now()
        if (parseFloat(sequence)) {
            return [new Token(T.str, String(ts / parseFloat(sequence)), token.argNo)]
        }
        return [new Token(T.str, String(Date.now()), token.argNo)]
    },

    escape_V: async (token, _char, sequence, int) => {
        if (!int) return [new Token(T.str, "", token.argNo)]
        let [scope, ...n] = sequence.split(":")
        let name = n.join(":")
        if (scope == "%") {
            scope = int.getMessage().author.id
        }
        else if (scope == ".") {
            let v = vars.getVar(int.getMessage(), name)
            if (v !== false) {
                return [new Token(T.str, v, token.argNo)]
            }
            return [new Token(T.str, `\\V{${sequence}}`, token.argNo)]
        }
        else if (!name) {
            name = scope
            let v = vars.getVar(int.getMessage(), name)
            if (v !== false) {
                return [new Token(T.str, v, token.argNo)]
            }
            return [new Token(T.str, `\\V{${sequence}}`, token.argNo)]
        }
        let v = vars.getVar(int.getMessage(), name, scope)
        if (v !== false) {
            return [new Token(T.str, v, token.argNo)]
        }
        return [new Token(T.str, `\\V{${sequence}}`, token.argNo)]
    },

    escape_v: async (token, _char, sequence, int) => {
        if (!int) return [new Token(T.str, "", token.argNo)]
        let num = Number(sequence)
        //basically checks if it's a n
        if (!isNaN(num)) {
            let args = int.getMessage().content.split(" ")
            return [new Token(T.str, String(args[num]), token.argNo)]
        }
        let v = vars.getVar(int.getMessage(), sequence, int.getMessage().author.id)
        if (v === false)
            v = vars.getVar(int.getMessage(), sequence)
        if (v !== false) {
            return [new Token(T.str, v, token.argNo)]
        }
        return [new Token(T.str, `\\v{${sequence}}`, token.argNo)]
    },

    ["escape_\\"]: async (token, _char, sequence) => {
        if (sequence) {
            return [new Token(T.str, `\\{${sequence}}`, token.argNo)]
        }
        return [new Token(T.str, "\\", token.argNo)]

    },

    ["escape_ "]: async (token, _char, sequence) => {
        if (sequence) {
            return [new Token(T.str, sequence, token.argNo)]
        }
        return [new Token(T.str, " ", token.argNo)]
    }

} as { [key: string]: (token: Token, char: string, seq: string, interpreter: Interpreter) => Promise<Token[]> }
