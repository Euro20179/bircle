import { isBetween } from "./util";

class Iter{
    constructor(private iterable: Generator<any>){}

    enumerate(){
        this.iterable = enumerate(this.iterable)
        return this
    }

    take(n: number){
        this.iterable = take(this.iterable, n)
        return this
    }

    map(mapping: Function){
        this.iterable = map(this.iterable, mapping)
        return this
    }

    reduce<T>(initial: T, fn: (res: T, c: any) => T){
        return reduce(this.iterable, initial, fn)
    }

    filter(filterFn: (item: any, idx: number) => boolean){
        this.iterable = filter(this.iterable, filterFn)
        return this
    }

    filterMap(filterMapFn: (item: any, idx: number) => [false] | [true, any]){
        this.iterable = filterMap(this.iterable, filterMapFn)
        return this
    }

    *[Symbol.iterator](){
        yield* this.iterable
    }
}

/**
 * @description maps an item, if the result is truthy keep it otherwise discard
 */
function* filterMap<T>(iterable: Iterable<T>, filtermapFn: (item: any, idx: number) => [false] | [true, any]){
    let i = 0
    for(const item of iterable){
        const res = filtermapFn(item, i)
        if(res[0]){
            yield res[1]
        }
    }
}

function* filter<T>(iterable: Iterable<T>, filterFn: (item: any, idx: number) => boolean){
    let i = 0
    for(const item of iterable){
        if(!filterFn(item, i)) continue
        yield item
        i++
    }
}

function* map<T>(iterable: Iterable<T>, mapping: Function) {
    let i = 0
    for(const item of iterable){
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
    for(const item of iterable){
        result = fn(result, item)
    }
    return result
}

/**
    * @description similar to python's range() function
*/
function range(start: number, end: number, step: number = 1) {
    return new Proxy(new Iter(function*(){
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


function intoIter<T extends {[Symbol.iterator](): any}>(item: T){
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
    map
}
