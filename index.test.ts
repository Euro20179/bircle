import { TextChannel, User } from 'discord.js'
import commands from './src/commands/commands'
import common from './src/common'
//@ts-ignore
import { expect, test, describe } from 'bun:test'
import common_to_commands from './src/common_to_commands'
import init from './src/init'
import globals from './src/globals'

import util = require("./src/util")

init.init()

commands();

let loggedIn = common.client.login(globals.getConfigValue("secrets.token"));

let chan: TextChannel

const getChannel = async () => {
    chan ||= await (await (await common.client.guilds.fetch()).filter(g => g.id === "427567510611820544").at(0)?.fetch())?.channels.fetch("1052699049310048356") as TextChannel
    return chan
}

const getFakeMsg = (content: string) => common_to_commands.createFakeMessage(common.client.user as User, chan, content)

const cmdTest = (cmd: string, ans: string) => {
    test(cmd, async (done: Function) => {
        await loggedIn
        await getChannel()
        let fakeMsg = getFakeMsg(`]${cmd}`)
        common_to_commands.cmd({ msg: fakeMsg, command_excluding_prefix: cmd, sendCallback: async () => fakeMsg }).then(rv => {
            expect(rv.rv.content).toBe(ans)
            done()
        })
    })
}

const fnTest = function <T extends (...args: any) => any>(fn: T, result: ReturnType<T>, ...args: Parameters<T>) {
    test(`${fn.name}(${JSON.stringify(args)})`, () => {
        //@ts-ignore
        expect(fn(...args)).toBe(result)
    })
}

describe("Utility functions", () => {
    fnTest(util.rgbToHex, "#000000", 0, 0, 0)
    fnTest(util.rgbToHex, "#033714", 3, 55, 20)
    fnTest(util.romanToBase10, 8, "VIII")
    fnTest(util.romanToBase10, 0, "")
    fnTest(util.romanToBase10, 50, "XXXXX")
    fnTest(util.titleStr, "Hello There", "hello there")
    fnTest(util.isSafeFilePath, false, "hello/..test")
    fnTest(util.isSafeFilePath, true, "hello..test")
    fnTest(util.isSafeFilePath, true, "hello")
    fnTest(util.isSafeFilePath, true, "hello.epic")
    fnTest(util.isSafeFilePath, false, "hello/epic")
    fnTest(util.countOf, 3, [3, 3, 3, 4], 3)
    fnTest(util.mulStr, "hihihi", "hi", 3)
    test("randomHexColorCode([])", () => {
        expect(util.randomHexColorCode()).toEqual(expect.stringMatching(/^#[0-9A-Z]{6}/))
    })
})


describe("Commands", () => {
    cmdTest("echo -D hi", "hi")
    cmdTest("echo -D ${LINENO}", "1")
    cmdTest("relscript x = 3; x + 5", "8")
    cmdTest("export x = 5 ;; echo -D ${x}", "5")
    cmdTest("echo -D hi >pipe> rev", "ih")
    cmdTest("echo -D hi $(echo -D yes) >pipe> rev", "sey ih")
    cmdTest("argc yes\\sno\\s{yes no}", "1")
})
