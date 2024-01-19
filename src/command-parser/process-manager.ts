import cmds from "./cmds"

export class ProcessManager {
    private PIDS: Map<number, ReturnType<typeof cmds.runcmd>> = new Map()
    private PIDLabels: Map<number, string> = new Map()
    running(pid: number) {
        return this.PIDS.get(pid) ? true : false
    }
    getproc(pid: number) {
        return this.PIDS.get(pid)
    }
    killproc(pid: number) {
        if(this.PIDS.has(pid)){
            this.PIDS.delete(pid)
            return true
        }
        return false
    }

    getproclabel(pid: number){
        return this.PIDLabels.get(pid)
    }

    getprocids(){
        return this.PIDS.keys()
    }

    async* spawn(label: string, result_generator: ReturnType<typeof cmds.runcmd>) {
        let pid = this.PIDS.size + 1
        this.PIDS.set(pid, result_generator)
        this.PIDLabels.set(pid, label)
        for await(let result of result_generator){
            if(!this.running(pid)){
                break
            }
            yield result
        }
        this.PIDS.delete(pid)
        return pid
    }
}
