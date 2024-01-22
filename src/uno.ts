const colors = ["red", "green", "blue", "yellow"]

class Card {
    type = "normal"
    constructor(public color: string, public value: string) {}
    canBePlayed(stack: Stack) {
        let latest = stack.top()
        if (!latest) return true
        if (latest.color === this.color || latest.value === this.value) {
            return true;
        }
        return false
    }
    toString() {
        return `${this.color}:${this.value}`
    }
    display() {
        switch (this.color) {
            case "blue":
                return `\`\`\`fix\n${this.value} (${this.color})\n\`\`\``
            case "yellow":
                return `\`\`\`html\n${this.value} (&${this.color};)\n\`\`\``
            case "red":
                return `\`\`\`diff\n- ${this.value} (${this.color})\n\`\`\``
            case "green":
                return `\`\`\`diff\n"+ ${this.value} (${this.color})"\n\`\`\``
            default:
                return `\`\`\`\n${this.color}: ${this.value}\n\`\`\``
        }
    }
}

class Minus1Card extends Card {
    color: string
    value: string
    type = "-1"
    constructor(color: string) {
        super(color, "-1")
        this.color = color
        this.value = "-1"
    }
    canBePlayed(stack: Stack) {
        let latest = stack.top()
        if (!latest) return true
        return latest.color == this.color || latest.type == '-1'
    }
    toString() {
        return `${this.color}:-1`
    }
    display() {
        switch (this.color) {
            case "blue":
                return `\`\`\`md\n# ${this.value}\n\`\`\``
            case "yellow":
                return `\`\`\`fix\n${this.value}\n\`\`\``
            case "red":
                return `\`\`\`diff\n- ${this.value}\n\`\`\``
            case "green":
                return `\`\`\`python\n"${this.value}"\n\`\`\``
            default:
                return `\`\`\`\n${this.color}: ${this.value}\n\`\`\``
        }
    }
}

class Plus4Card extends Card {
    color: string
    value: string
    type = "wild+4"
    constructor(color: string) {
        super(color, "WILD CARD +4")
        this.color = color
        this.value = "WILD CARD +4"
    }
    canBePlayed(_stack: Stack) {
        return true
    }
    toString() {
        return `${this.color}:wild`
    }
    display() {
        switch (this.color) {
            case "blue":
                return `\`\`\`md\n# ${this.value}\n\`\`\``
            case "yellow":
                return `\`\`\`fix\n${this.value}\n\`\`\``
            case "red":
                return `\`\`\`diff\n- ${this.value}\n\`\`\``
            case "green":
                return `\`\`\`python\n"${this.value}"\n\`\`\``
            default:
                return `\`\`\`\n${this.color}: ${this.value}\n\`\`\``
        }
    }
}

class Plus2Card extends Card {
    color: string
    value: string
    type = "+2"
    constructor(color: string) {
        super(color, "+2")
        this.color = color
        this.value = "+2"
    }
    canBePlayed(stack: Stack) {
        let last = stack.top()
        if (!last) return true
        return last.color == this.color || last.type == '+2'
    }
    toString() {
        return `${this.color}:+2`
    }
    display() {
        switch (this.color) {
            case "blue":
                return `\`\`\`md\n# ${this.value}\n\`\`\``
            case "yellow":
                return `\`\`\`fix\n${this.value}\n\`\`\``
            case "red":
                return `\`\`\`diff\n- ${this.value}\n\`\`\``
            case "green":
                return `\`\`\`python\n"${this.value}"\n\`\`\``
            default:
                return `\`\`\`\n${this.color}: ${this.value}\n\`\`\``
        }
    }
}

class SkipCard extends Card {
    color: string
    value: string
    type = "skip"
    constructor(color: string) {
        super(color, "SKIPPEROONIE")
        this.color = color
        this.value = "SKIPPEROONIE"
    }
    canBePlayed(stack: Stack) {
        let last = stack.top()
        if (!last) return true
        return last.color == this.color || last.type == 'skip'
    }
    toString() {
        return `${this.color}:skip`
    }
    display() {
        switch (this.color) {
            case "blue":
                return `\`\`\`md\n# ${this.value}\n\`\`\``
            case "yellow":
                return `\`\`\`fix\n${this.value}\n\`\`\``
            case "red":
                return `\`\`\`diff\n- ${this.value}\n\`\`\``
            case "green":
                return `\`\`\`python\n"${this.value}"\n\`\`\``
            default:
                return `\`\`\`\n${this.color}: ${this.value}\n\`\`\``
        }
    }
}


class WildCard extends Card {
    color: string
    value: string
    type = "wild"
    constructor(color: string) {
        super(color, "WILD CARD")
        this.color = color
        this.value = "WILD CARD"
    }
    canBePlayed(_stack: Stack) {
        return true
    }
    toString() {
        return `${this.color}:wild`
    }
    display() {
        switch (this.color) {
            case "blue":
                return `\`\`\`md\n# ${this.value}\n\`\`\``
            case "yellow":
                return `\`\`\`fix\n${this.value}\n\`\`\``
            case "red":
                return `\`\`\`diff\n- ${this.value}\n\`\`\``
            case "green":
                return `\`\`\`python\n"${this.value}"\n\`\`\``
            default:
                return `\`\`\`\n${this.color}: ${this.value}\n\`\`\``
        }
    }
}

class ShuffleStackCard extends Card {
    color: string
    value: string
    type = "shuffle-stack"
    constructor(color: string) {
        super(color, "SHUFFLE STACK")
        this.color = color
        this.value = "SHUFFLE STACK"
    }
    canBePlayed(stack: Stack) {
        let latest = stack.top()
        if (!latest) return true
        return latest.type == "shuffle-stack" || latest.color == this.color
    }
    toString() {
        return `${this.color}:shuffle-stack`
    }
    display() {
        switch (this.color) {
            case "blue":
                return `\`\`\`md\n# ${this.value}\n\`\`\``
            case "yellow":
                return `\`\`\`fix\n${this.value}\n\`\`\``
            case "red":
                return `\`\`\`diff\n- ${this.value}\n\`\`\``
            case "green":
                return `\`\`\`python\n"${this.value}"\n\`\`\``
            default:
                return `\`\`\`\n${this.color}: ${this.value}\n\`\`\``
        }
    }
}

class GiveCard extends Card {
    color: string
    value: string
    type = "give"
    constructor(color: string) {
        super(color, "GIVE CARD")
        this.color = color
        this.value = "GIVE CARD"
    }
    canBePlayed(stack: Stack) {
        let latest = stack.top()
        if (!latest) return true
        return latest.type == 'give' || latest.color == this.color
    }
    toString() {
        return `${this.color}:give`
    }
    display() {
        switch (this.color) {
            case "blue":
                return `\`\`\`md\n# ${this.value}\n\`\`\``
            case "yellow":
                return `\`\`\`fix\n${this.value}\n\`\`\``
            case "red":
                return `\`\`\`diff\n- ${this.value}\n\`\`\``
            case "green":
                return `\`\`\`python\n"${this.value}"\n\`\`\``
            default:
                return `\`\`\`\n${this.color}: ${this.value}\n\`\`\``
        }
    }
}

class Stack {
    cards: Card[]
    constructor(cards: Card[]) {
        this.cards = cards
        this.shuffle()
    }
    shuffle() {
        this.cards = this.cards.shuffleArray()
    }
    top() {
        return this.cards[this.cards.length - 1]
    }
    add(card: Card) {
        this.cards.push(card)
    }
    draw() {
        let rv = this.cards.pop()
        if (rv)
            return rv
        else {
            return false;
        }
    }
    drawInto(hand: Hand) {
        let rv = this.draw()
        if (rv) {
            hand.add(rv)
            return true
        }
        else return false
    }
    toString() {
        let ret = "["
        for (let card of this.cards) {
            ret += `${card},`
        }
        return `${ret}]`
    }
}

class Hand {
    cards: Card[]
    constructor(count: number, stack: Stack) {
        this.cards = []
        for (let i = 0; i < count; i++) {
            this.draw(stack)
        }
    }
    add(card: Card) {
        this.cards.push(card)
    }
    draw(stack: Stack) {
        let card = stack.draw()
        if (card) {
            this.cards.push(card)
            return true
        }
        else {
            return false
        }
    }
    remove(card: Card | number) {
        if (typeof card == 'number')
            this.cards = this.cards.filter((_, i) => i != card)
        else this.cards = this.cards.filter(v => v != card)
    }
    hasWon() {
        return this.cards.length <= 0
    }
    toString() {
        let ret = "["
        for (let card of this.cards) {
            ret += `${card},`
        }
        return `${ret}]`
    }
}

function getWinners(players: { [k: string]: Hand }) {
    for (let player in players) {
        let hand = players[player]
        if (hand.hasWon())
            return player
    }
    return false
}

function createCards(
    numberMax: number,
    {
        enableGive,
        enableShuffle,
        enable1
    }: {enableGive: boolean, enableShuffle: boolean, enable1: boolean}
) {
    numberMax ||= 9
    let numbers = Array.from({length: numberMax}, (_, idx) => String(idx))
    let cards = []
    let specialCards = [WildCard, SkipCard, Plus2Card, Plus4Card]
    for (let color of colors) {
        for (let number of numbers) {
            cards.push(new Card(color, number))
        }
        for(let special of specialCards){
            cards.push(new special(color))
        }
        if (enableGive) {
            cards.push(new GiveCard(color))
        }
        if (enableShuffle) {
            cards.push(new ShuffleStackCard(color))
        }
        if (enable1) {
            cards.push(new Minus1Card(color))
        }
    }
    return cards
}

export {
    Hand,
    Card,
    Stack,
    createCards,
    getWinners,
}
