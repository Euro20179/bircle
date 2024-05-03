import { LinkedList } from "./linkedlist"
export class Queue<T> {
    queue: LinkedList<T>
    len: number
    constructor(...items: T[]){
        this.queue = new LinkedList()
        this.len = 0
        for(let i = 0; i < items.length; i++){
            this.queue.append(items[i])
        }
    }

    *[Symbol.iterator](){
        yield* this.queue[Symbol.iterator]()
    }

    enqueue(item: T){
        this.len++
        this.queue.append(item)
    }

    dequeue(){
        return this.queue.popFront()
    }

    clear(){
        this.queue.clear()
    }
}

export default {
    Queue
}
