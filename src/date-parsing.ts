enum Token {
    Plus,
    Minus,
    Number,
    Word,
    Colon
}

class Tok {
    constructor(public tok: Token, public data: string) { }
}

const alpha = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"

function parseWord(text: string, start: number) {
    let word = ""
    let i = start
    for (; i < text.length; i++) {
        if (!alpha.includes(text[i])) {
            break
        }
        word += text[i]
    }
    return [word, i] as const
}

function parseNumber(text: string, start: number) {
    let word = ""
    let i = start
    for (; i < text.length; i++) {
        if (!'1234567890'.includes(text[i])) {
            break
        }
        word += text[i]
    }
    return [word, i] as const
}

function tokenizeDate(date: string) {
    let toks: Tok[] = []

    for (let i = 0; i < date.length; i++) {
        const char = date[i]
        switch (char) {
            case "\t":
            case "\n":
            case " ":
                continue
            case ':': {
                toks.push(new Tok(Token.Colon, ":"))
                break
            }
            case '+': {
                toks.push(new Tok(Token.Plus, '+'))
                break
            }
            case '-': {
                toks.push(new Tok(Token.Plus, '-'))
                break
            }
            case '0':
            case '1':
            case '2':
            case '3':
            case '4':
            case '5':
            case '6':
            case '7':
            case '8':
            case '9':
                let n
                [n, i] = parseNumber(date, i)
                i--
                toks.push(new Tok(Token.Number, n))
                break

            default:
                let w
                [w, i] = parseWord(date, i)
                toks.push(new Tok(Token.Word, w))
                break
        }
    }
    return toks
}

function parseDate(date: string, timezone: string) {
    //console.log(tokenizeDate(date))
    let timezoneDirection = timezone[0]
    let timezoneHours = Number(timezone[1])
    let timezoneMinutes = Number(timezone.slice(2))
    //get time relative to UTC
    const now = new Date(new Date(Date.now()).getTime())

    //get timezone offset relative to UTC
    switch (timezoneDirection) {
        case '-':
            now.setHours(now.getUTCHours() - timezoneHours)
            now.setMinutes(now.getUTCMinutes() - timezoneMinutes)
            break
        case '+':
            now.setHours(now.getUTCHours() + timezoneHours)
            now.setMinutes(now.getUTCMinutes() + timezoneMinutes)
            break
    }

    const match = date.match(/^([-+])?(\d+)(?::(\d+)(?::(\d+))?)?$/)
    if (match) {
        if (match[1] === "+") {
            return new Date(
                now.getFullYear(),
                now.getMonth(),
                now.getDate(),
                now.getHours() + Number(match[2]),
                now.getMinutes() + Number(match[3] || 0),
                now.getSeconds() + Number(match[4] || 0)
            )
        } else if (match[1] === '-') {
            return new Date(
                now.getFullYear(),
                now.getMonth(),
                now.getDate(),
                now.getHours() - Number(match[2]),
                now.getMinutes() - Number(match[3] || 0),
                now.getSeconds() - Number(match[4] || 0)
            )
        } else {
            return new Date(
                now.getFullYear(),
                now.getMonth(),
                now.getDate(),
                Number(match[2]) - 1,
                Number(match[3] || 0),
                Number(match[4] || 0)
            )
        }
    }
    return now
}

export default {
    parseDate
}
