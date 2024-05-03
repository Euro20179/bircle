class LLNode<T> {
    val: T
    next?: LLNode<T>
    constructor(val: T){
        this.val = val
    }
}

export class LinkedList<T> {
    head?: LLNode<T>
    last?: LLNode<T>
    len: number
    constructor(){
        this.len = 0
    }

    append(item: T){
        if(!this.head){
            this.head = new LLNode(item)
            this.last = this.head
        } else {
            this.last!.next = new LLNode(item)
            this.last = this.last!.next
        }
    }

    popFront(){
        if(!this.head){
            return
        }
        const temp = this.head
        this.head = this.head.next
        if(!this.head){
            this.last = undefined
        }
        return temp.val
    }

    *[Symbol.iterator](){
        let cur = this.head
        while(cur){
            yield cur
            cur = cur.next
        }
    }

    clear(){
        this.head = undefined
        this.last = undefined
        //gc SHOULD handle deleting everything in between
    }
}

export default {
    LinkedList
}
