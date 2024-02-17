import fs from 'fs'

type Usage = Record<string, number>

export class UseTracker {
    usage: Usage
    constructor(public file_path: string, load_file = true){
        this.usage = {}

        if(load_file && fs.existsSync(file_path)){
            this.readFromUseFile()
        }
    }

    reset(){
        this.usage = {}
    }

    readFromUseFile(){
        fs.readFile(this.file_path, (err, data) => {
            if(err){
                return
            }
            let text = data.toString()

            for(let line of text.split("\n")){
                if(!line) continue
                let [item, count] = line.split(":")
                this.usage[item] = parseInt(count)
            }
        })
    }

    generateUsageText(){
        let text = ""
        for(let key in this.usage){
            text += `${key}:${this.usage[key]}\n`
        }
        return text
    }

    saveUsage(){
        fs.writeFile(this.file_path, this.generateUsageText(), () => {})
    }

    addToUsage(name: string){
        if(this.usage[name]){
            this.usage[name] += 1
        }
        else {
            this.usage[name] = 1
        }
        this.saveUsage()
    }

    removeFromUsage(name: string){
        if(this.usage[name]){
            this.usage[name] -= 1
        }
    }
}

export let cmdUsage = new UseTracker("data/cmduse")
export let emoteUsage = new UseTracker("data/emoteuse")

export default {
    UseTracker,
    cmdUsage,
    emoteUsage
}
