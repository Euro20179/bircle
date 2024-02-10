import cmds, { RunCmdOptions } from "./cmds"

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

    async* spawn_cmd(args: RunCmdOptions, label?: string, version = 2) {
        label ??= args.command
        args.pid_label = label
        let result_generator =
            version === 2
                ? cmds.runcmd(args)
                : cmds.runcmdv2(args)
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
