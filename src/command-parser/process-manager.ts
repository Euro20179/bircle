import { StatusCode } from "../common_to_commands"
import cmds, { RunCmdOptions } from "./cmds"

export class ProcessManager {
    private PIDS: Map<number, ReturnType<typeof cmds.runcmdv2>> = new Map()
    private PIDLabels: Map<number, string> = new Map()
    running(pid: number) {
        return this.PIDS.get(pid) ? true : false
    }
    getproc(pid: number) {
        return this.PIDS.get(pid)
    }
    killproc(pid: number) {
        if (this.PIDS.has(pid)) {
            this.PIDS.delete(pid)
            return true
        }
        return false
    }

    getproclabel(pid: number) {
        return this.PIDLabels.get(pid)
    }

    getprocids() {
        return this.PIDS.keys()
    }

    getprocidFromLabel(label: string){
        for(let [k, v] of this.PIDLabels.entries()){
            if(v === label){
                return Number(k)
            }
        }
    }

    async* spawn_cmd(args: RunCmdOptions, label?: string, options?: {parentPID?: number}) {
        if (options?.parentPID && !this.getproc(options.parentPID)){
            return { noSend: true, status: StatusCode.ERR }
        }
        label ??= args.command
        args.pid_label = label
        let result_generator = cmds.runcmdv2(args)
        let pid = this.PIDS.size + 1
        this.PIDS.set(pid, result_generator)
        this.PIDLabels.set(pid, label || args.command)
        for await (let result of result_generator) {
            if (!this.running(pid)) {
                break
            }
            yield result
        }
        result_generator.return("done")
        this.killproc(pid)
        return pid
    }
}
