import { StatusCode } from "../common_to_commands"
import { sleep } from "../util"
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

    /*
        * @description gets the first result then kills itself
    */
    async spawn_cmd_then_die(args: RunCmdOptions, label?: string, options?: {parentPID?: number}){
        label ??= `${args.command}${this.PIDS.size}`
        for await(let result of this.spawn_cmd(args, label, options)){
            this.killproc(this.getprocidFromLabel(label) as number)
            return result
        }
        return { noSend: true, status: 1 }
    }

    async* spawn_cmd(args: RunCmdOptions, label?: string, options?: { parentPID?: number, }) {
        if (options?.parentPID && !this.getproc(options.parentPID)){
            return { noSend: true, status: StatusCode.ERR }
        }
        label ??= args.command
        if(!label.includes(`:${args.msg.author.id}`)){
            label += `:${args.msg.author.id}`
        }
        args.pid_label = label
        let result_generator = cmds.runcmdv2(args)
        let pid = this.PIDS.size + 1
        this.PIDS.set(pid, result_generator)
        this.PIDLabels.set(pid, label || args.command)
        for await (let result of result_generator) {
            if (!this.running(pid)) {
                break
            }

            //checkin status is so that the process manager can stop the command if necessary
            //this also means it can't be above the if(!this.running) if statement
            if(result.status === StatusCode.CHECKIN) {
                //microsleep here to prevent an infinite loop with something like
                //do 100000 for i..Infinity {!!}
                //microsleep lets another process (or even node) do something
                await sleep(0)
                continue
            }
            yield result
        }
        result_generator.return("done")
        this.killproc(pid)
        return pid
    }
}
