"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getWinners = exports.createCards = exports.Stack = exports.Card = exports.Hand = void 0;
const colors = ["red", "green", "blue", "yellow"];
class Card {
    constructor(color, value) {
        this.type = "normal";
        this.color = color;
        this.value = value;
    }
    canBePlayed(stack) {
        let latest = stack.top();
        if (!latest)
            return true;
        if (latest.color === this.color || latest.value === this.value) {
            return true;
        }
        return false;
    }
    toString() {
        return `${this.color}:${this.value}`;
    }
    display() {
        switch (this.color) {
            case "blue":
                return `\`\`\`md\n# ${this.value} (${this.color})\n\`\`\``;
            case "yellow":
                return `\`\`\`fix\n${this.value} (${this.color})\n\`\`\``;
            case "red":
                return `\`\`\`diff\n- ${this.value} (${this.color})\n\`\`\``;
            case "green":
                return `\`\`\`python\n"${this.value} (${this.color})"\n\`\`\``;
            default:
                return `\`\`\`\n${this.color}: ${this.value}\n\`\`\``;
        }
    }
}
exports.Card = Card;
class Minus1Card extends Card {
    constructor(color) {
        super(color, "-1");
        this.type = "-1";
        this.color = color;
        this.value = "-1";
    }
    canBePlayed(stack) {
        let latest = stack.top();
        if (!latest)
            return true;
        return latest.color == this.color || latest.type == '-1';
    }
    toString() {
        return `${this.color}:-1`;
    }
    display() {
        switch (this.color) {
            case "blue":
                return `\`\`\`md\n# ${this.value}\n\`\`\``;
            case "yellow":
                return `\`\`\`fix\n${this.value}\n\`\`\``;
            case "red":
                return `\`\`\`diff\n- ${this.value}\n\`\`\``;
            case "green":
                return `\`\`\`python\n"${this.value}"\n\`\`\``;
            default:
                return `\`\`\`\n${this.color}: ${this.value}\n\`\`\``;
        }
    }
}
class Plus4Card extends Card {
    constructor(color) {
        super(color, "WILD CARD +4");
        this.type = "wild+4";
        this.color = color;
        this.value = "WILD CARD +4";
    }
    canBePlayed(_stack) {
        return true;
    }
    toString() {
        return `${this.color}:wild`;
    }
    display() {
        switch (this.color) {
            case "blue":
                return `\`\`\`md\n# ${this.value}\n\`\`\``;
            case "yellow":
                return `\`\`\`fix\n${this.value}\n\`\`\``;
            case "red":
                return `\`\`\`diff\n- ${this.value}\n\`\`\``;
            case "green":
                return `\`\`\`python\n"${this.value}"\n\`\`\``;
            default:
                return `\`\`\`\n${this.color}: ${this.value}\n\`\`\``;
        }
    }
}
class Plus2Card extends Card {
    constructor(color) {
        super(color, "+2");
        this.type = "+2";
        this.color = color;
        this.value = "+2";
    }
    canBePlayed(stack) {
        let last = stack.top();
        if (!last)
            return true;
        return last.color == this.color || last.type == '+2';
    }
    toString() {
        return `${this.color}:+2`;
    }
    display() {
        switch (this.color) {
            case "blue":
                return `\`\`\`md\n# ${this.value}\n\`\`\``;
            case "yellow":
                return `\`\`\`fix\n${this.value}\n\`\`\``;
            case "red":
                return `\`\`\`diff\n- ${this.value}\n\`\`\``;
            case "green":
                return `\`\`\`python\n"${this.value}"\n\`\`\``;
            default:
                return `\`\`\`\n${this.color}: ${this.value}\n\`\`\``;
        }
    }
}
class SkipCard extends Card {
    constructor(color) {
        super(color, "SKIPPEROONIE");
        this.type = "skip";
        this.color = color;
        this.value = "SKIPPEROONIE";
    }
    canBePlayed(stack) {
        let last = stack.top();
        if (!last)
            return true;
        return last.color == this.color || last.type == 'skip';
    }
    toString() {
        return `${this.color}:skip`;
    }
    display() {
        switch (this.color) {
            case "blue":
                return `\`\`\`md\n# ${this.value}\n\`\`\``;
            case "yellow":
                return `\`\`\`fix\n${this.value}\n\`\`\``;
            case "red":
                return `\`\`\`diff\n- ${this.value}\n\`\`\``;
            case "green":
                return `\`\`\`python\n"${this.value}"\n\`\`\``;
            default:
                return `\`\`\`\n${this.color}: ${this.value}\n\`\`\``;
        }
    }
}
class WildCard extends Card {
    constructor(color) {
        super(color, "WILD CARD");
        this.type = "wild";
        this.color = color;
        this.value = "WILD CARD";
    }
    canBePlayed(_stack) {
        return true;
    }
    toString() {
        return `${this.color}:wild`;
    }
    display() {
        switch (this.color) {
            case "blue":
                return `\`\`\`md\n# ${this.value}\n\`\`\``;
            case "yellow":
                return `\`\`\`fix\n${this.value}\n\`\`\``;
            case "red":
                return `\`\`\`diff\n- ${this.value}\n\`\`\``;
            case "green":
                return `\`\`\`python\n"${this.value}"\n\`\`\``;
            default:
                return `\`\`\`\n${this.color}: ${this.value}\n\`\`\``;
        }
    }
}
class ShuffleStackCard extends Card {
    constructor(color) {
        super(color, "SHUFFLE STACK");
        this.type = "shuffle-stack";
        this.color = color;
        this.value = "SHUFFLE STACK";
    }
    canBePlayed(stack) {
        let latest = stack.top();
        if (!latest)
            return true;
        return latest.type == "shuffle-stack" || latest.color == this.color;
    }
    toString() {
        return `${this.color}:shuffle-stack`;
    }
    display() {
        switch (this.color) {
            case "blue":
                return `\`\`\`md\n# ${this.value}\n\`\`\``;
            case "yellow":
                return `\`\`\`fix\n${this.value}\n\`\`\``;
            case "red":
                return `\`\`\`diff\n- ${this.value}\n\`\`\``;
            case "green":
                return `\`\`\`python\n"${this.value}"\n\`\`\``;
            default:
                return `\`\`\`\n${this.color}: ${this.value}\n\`\`\``;
        }
    }
}
class GiveCard extends Card {
    constructor(color) {
        super(color, "GIVE CARD");
        this.type = "give";
        this.color = color;
        this.value = "GIVE CARD";
    }
    canBePlayed(stack) {
        let latest = stack.top();
        if (!latest)
            return true;
        return latest.type == 'give' || latest.color == this.color;
    }
    toString() {
        return `${this.color}:give`;
    }
    display() {
        switch (this.color) {
            case "blue":
                return `\`\`\`md\n# ${this.value}\n\`\`\``;
            case "yellow":
                return `\`\`\`fix\n${this.value}\n\`\`\``;
            case "red":
                return `\`\`\`diff\n- ${this.value}\n\`\`\``;
            case "green":
                return `\`\`\`python\n"${this.value}"\n\`\`\``;
            default:
                return `\`\`\`\n${this.color}: ${this.value}\n\`\`\``;
        }
    }
}
class Stack {
    constructor(cards) {
        this.cards = cards;
        this.shuffle();
    }
    shuffle() {
        this.cards = this.cards.sort(() => Math.random() - .5);
    }
    top() {
        return this.cards[this.cards.length - 1];
    }
    add(card) {
        this.cards.push(card);
    }
    draw() {
        let rv = this.cards.pop();
        if (rv)
            return rv;
        else {
            return false;
        }
    }
    drawInto(hand) {
        let rv = this.draw();
        if (rv) {
            hand.add(rv);
            return true;
        }
        else
            return false;
    }
    toString() {
        let ret = "[";
        for (let card of this.cards) {
            ret += `${card},`;
        }
        return `${ret}]`;
    }
}
exports.Stack = Stack;
class Hand {
    constructor(count, stack) {
        this.cards = [];
        for (let i = 0; i < count; i++) {
            this.draw(stack);
        }
    }
    add(card) {
        this.cards.push(card);
    }
    draw(stack) {
        let card = stack.draw();
        if (card) {
            this.cards.push(card);
            return true;
        }
        else {
            return false;
        }
    }
    remove(card) {
        if (typeof card == 'number')
            this.cards = this.cards.filter((_, i) => i != card);
        else
            this.cards = this.cards.filter(v => v != card);
    }
    hasWon() {
        return this.cards.length <= 0;
    }
    toString() {
        let ret = "[";
        for (let card of this.cards) {
            ret += `${card},`;
        }
        return `${ret}]`;
    }
}
exports.Hand = Hand;
function getWinners(players) {
    for (let player in players) {
        let hand = players[player];
        if (hand.hasWon())
            return player;
    }
    return false;
}
exports.getWinners = getWinners;
//@ts-ignore
function createCards(numberMax, { enableGive, enableShuffle, enable1 }) {
    if (!numberMax) {
        numberMax = 9;
    }
    let numbers = [];
    for (let i = 0; i <= numberMax; i++) {
        numbers.push(String(i));
    }
    let cards = [];
    for (let color of colors) {
        for (let number of numbers) {
            cards.push(new Card(color, number));
        }
        cards.push(new WildCard(color));
        cards.push(new SkipCard(color));
        cards.push(new Plus2Card(color));
        cards.push(new Plus4Card(color));
        if (enableGive) {
            cards.push(new GiveCard(color));
        }
        if (enableShuffle) {
            cards.push(new ShuffleStackCard(color));
        }
        if (enable1) {
            cards.push(new Minus1Card(color));
        }
    }
    return cards;
}
exports.createCards = createCards;
