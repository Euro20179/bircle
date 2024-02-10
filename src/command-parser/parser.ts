import lexer, { TT } from './lexer'

function createCommandFromTokens(token_generator: Generator<TT<any>>): TT<any>[][][] {
    let lines = []

    let cur_token: TT<any> | undefined

    let done = false

    function createPipePart(token_generator: Generator<TT<any>>) {
        let tokens = []
        let gen_value
        while((gen_value = token_generator.next())){
            cur_token = gen_value.value
            done = gen_value.done ?? false
            if (done || !cur_token || cur_token instanceof lexer.TTPipe || cur_token instanceof lexer.TTSemi) {
                break
            }
            tokens.push(cur_token)
        }
        return tokens
    }

    function createCommandLine(token_generator: Generator<TT<any>>) {
        let ll = []
        do {
            ll.push(createPipePart(token_generator))
        } while (!done && !(cur_token instanceof lexer.TTSemi))
        return ll
    }

    do {
        lines.push(createCommandLine(token_generator))
    } while (cur_token)
    return lines
}

export default {
    createCommandFromTokens
}
