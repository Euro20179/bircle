import { isBetween } from "./util";

export class Iter {
    constructor(private iterable: Generator<any>) { }

    enumerate() {
        this.iterable = enumerate(this.iterable)
        return this
    }

    take(n: number) {
        this.iterable = take(this.iterable, n)
        return this
    }

    map(mapping: Function) {
        this.iterable = map(this.iterable, mapping)
        return this
    }

    reduce<T>(initial: T, fn: (res: T, c: any) => T) {
        return reduce(this.iterable, initial, fn)
    }

    filter(filterFn: (item: any, idx: number) => boolean) {
        this.iterable = filter(this.iterable, filterFn)
        return this
    }

    filterMap(filterMapFn: (item: any, idx: number) => [false] | [true, any]) {
        this.iterable = filterMap(this.iterable, filterMapFn)
        return this
    }

    next() {
        return this.iterable.next().value
    }

    *[Symbol.iterator]() {
        yield* this.iterable
    }
}

/**
 * @description maps an item, if the result is truthy keep it otherwise discard
 */
function* filterMap<T>(iterable: Iterable<T>, filtermapFn: (item: any, idx: number) => [false] | [true, any]) {
    let i = 0
    for (const item of iterable) {
        const res = filtermapFn(item, i)
        if (res[0]) {
            yield res[1]
        }
    }
}

function* filter<T>(iterable: Iterable<T>, filterFn: (item: any, idx: number) => boolean) {
    let i = 0
    for (const item of iterable) {
        if (!filterFn(item, i)) continue
        yield item
        i++
    }
}

function* map<T>(iterable: Iterable<T>, mapping: Function) {
    let i = 0
    for (const item of iterable) {
        yield mapping(item, i)
        i++
    }
}
/**
    * @description similar to python's enumerate() function
*/
function* enumerate<T>(iterable: Iterable<T>): Generator<[number, T]> {
    let i = 0
    for (let item of iterable) {
        yield [i++, item]
    }
}

/**
 * @description Takes the next **n** items from an iterable
 */
function* take<T>(iterable: Iterable<T>, n: number): Generator<T> {
    let i = 0;
    for (let item of iterable) {
        yield item
        i++
        if (i >= n) {
            break
        }
    }
}

/**
 * @description Reduces an iterable
 */
function reduce<T, R>(iterable: Iterable<T>, start: R, fn: (result: R, cur: T) => R): R {
    let result = start
    for (const item of iterable) {
        result = fn(result, item)
    }
    return result
}

function sequence(...ns: number[]) {
    const max = ns[ns.length - 1]
    const seq = ns.slice(0, -1)
    let fillerFn = function*() {
        yield 0
    }
    function createArithFillerFn(start: number, max: number, diff: number) {
        let comp = (_a: number, _b: number) => false
        if (diff < 0 && max > start) {
            return 0
        }
        else if (diff < 0) {
            comp = (a: number, b: number) => a >= b
        }
        else {
            comp = (a: number, b: number) => a <= b
        }
        return function*() {
            for (let i = start; comp(i, max); i += diff) {
                yield i
            }
        }
    }
    switch (seq.length) {
        case 2: {
            let fn = createArithFillerFn(seq[0], max, seq[1] - seq[0])
            if (fn === 0) {
                return false
            }
            fillerFn = fn as () => Generator<number, void, unknown>
            break
        }
        case 1: {
            fillerFn = function*() {
                for (let i = seq[0]; i <= max; i++) {
                    yield i
                }
            }
            break
        }
        default: {
            //we do this because for the multiplictive series, it may start with 0
            //if we let the user start it at 0 the loop will never be able to increase
            //because x * 0 = 0
            //to fix this, only look at the last 3 items in the sequence the user gives
            //then prefix the final result with the numbers taken from the splice
            //
            //if the seq is exactly 3 items and starts with 0, it's gauranteed to be adititive
            let prefixNums = seq.splice(0, seq.length - 3)
            //if the difference between n2 n1, and n1 n0 are the same it's an additive series
            if (seq[2] - seq[1] === seq[1] - seq[0]) {
                const diff = seq[2] - seq[1]
                let fn = createArithFillerFn(seq[0], max, diff)
                if (fn === 0) {
                    return false
                }
                fillerFn = fn as () => Generator<number, void, unknown>
            }
            else if (seq[2] / seq[1] === seq[1] / seq[0]) {
                const ratio = seq[1] / seq[0]
                if (ratio < 0 && max > seq[0]) {
                    return false
                }
                fillerFn = function*() {
                    for (let i = seq[0]; i <= max; i *= ratio) {
                        yield i
                    }
                }
            }
            let oldFiller = fillerFn
            fillerFn = function*() {
                for (let item of prefixNums) {
                    yield item
                }
                yield* oldFiller()
            }
            break
        }
    }
    return new Iter(fillerFn())
}

/**
    * @description similar to python's range() function
*/
function range(start: number, end: number, step: number = 1) {
    return new Proxy(new Iter(function*() {
        for (let i = 0; i < end; i += step) {
            yield i
        }
    }()), {
        get(target, p) {
            let val = target[p as keyof typeof target]
            return typeof val === 'function' ? val.bind(target) : val
        },
        has(_target, p) {
            let n = Number(p)
            //we need to shift it because then we can just do n % end == 0 to check if the step is correct
            let [shiftedP, shiftedEnd] = [n - start, end - start]
            return isBetween(start - 1, n, end) && shiftedP % shiftedEnd == 0
        }
    })
}

/**
 * @param {Iterable} iter
 * @param {function(number):void} [onNext]
 * @returns {Iterable}
 */
function* cycle<T>(iter: Array<T>, onNext?: (n: number) => void): Generator<T> {
    for (let i = 0; true; i++) {
        if (onNext)
            onNext(i)
        yield iter[i % iter.length]
    }
}


function intoIter<T extends { [Symbol.iterator](): any }>(item: T) {
    return item[Symbol.iterator]()
}

console.log(
    reduce(new Iter(intoIter([3, 4, 5, 6, 7])).take(3), 0, (p, c) => p + c)
)

export default {
    reduce,
    take,
    enumerate,
    range,
    cycle,
    intoIter,
    Iter,
    filterMap,
    filter,
    map,
    sequence
}
