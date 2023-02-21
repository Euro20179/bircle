import { MessageEmbed, Message, MessageMentionOptions, MessageOptions, MessagePayload, TextChannel, DMChannel } from "discord.js"

import { ArgList, Options } from './util'

declare global {
    type ArgumentList = Array<string>

    type Opts = { [k: string]: string | boolean }

    type CommandCategory = typeof CommandCategory

    interface CommandFile {
        attachment: string,
        name?: string,
        description?: string,
        delete?: boolean
    }

    type FileArray = Array<CommandFile>

    interface CommandReturn extends MessageOptions {
        status: StatusCode
        content?: string,
        embeds?: Array<MessageEmbed>
        files?: FileArray,
        deleteFiles?: boolean
        delete?: boolean
        noSend?: boolean,
        allowedMentions?: MessageMentionOptions,
        /**
            * @deprecated use the channel property instead
        */
        dm?: boolean,
        recurse?: boolean | { categories?: CommandCategory[], commands?: string[] },
        do_change_cmd_user_expansion?: boolean
        channel?: TextChannel | DMChannel
    }

    interface CommandHelpArguments {
        [key: string]: {
            description: string,
            required?: boolean,
            requires?: string,
            default?: string
        }
    }

    interface CommandHelpOptions {
        [key: string]: {
            description: string,
            alternates?: string[],
            default?: string
        }
    }

    interface CommandHelp {
        info?: string,
        /**
         * @deprecated Use /ccmd <alias name> <command> <text> instead, ie: no built in aliases
         */
        aliases?: string[],
        arguments?: CommandHelpArguments,
        options?: CommandHelpOptions,
        tags?: string[]
    }

    interface ValidationReturn extends CommandReturn {
        invalid: string
    }

    type CommandRun = (msg: Message, args: ArgumentList, sendCallback: (data: MessageOptions | MessagePayload | string) => Promise<Message>, opts: Opts, deopedArgs: ArgumentList, recursion_count: number, command_bans?: { categories?: CommandCategory[], commands?: string[] }) => Promise<CommandReturn>

    interface Command {
        run: CommandRun;
        permCheck?: (msg: Message) => boolean;
        help?: CommandHelp
        category: CommandCategory,
        make_bot_type?: boolean,
        use_result_cache?: boolean
        cmd_std_version?: 1
    }

    interface CommandV2RunArg { msg: Message<boolean>, rawArgs: ArgumentList, sendCallback: (data: MessageOptions | MessagePayload | string) => Promise<Message>, opts: Options, args: ArgList, recursionCount: number, commandBans?: { categories?: CommandCategory[], commands?: string[] }, argList: ArgList, stdin?: CommandReturn, pipeTo?: Token[] }

    type CommandV2Run = (this: [string, CommandV2], {msg, rawArgs, sendCallback, opts, args, recursionCount, commandBans}: CommandV2RunArg) => Promise<CommandReturn>;

    interface CommandV2 {
        run: CommandV2Run
        permCheck?: (msg: Message) => boolean;
        help?: CommandHelp
        category: CommandCategory,
        make_bot_type?: boolean,
        use_result_cache?: boolean
        cmd_std_version?: 2
    }

    interface MatchCommand{
        run: ({msg, match}: {msg: Message, match: RegExpMatchArray}) => Promise<CommandReturn>,
        match: RegExp,
        name: string,
        category: CommandCategory.MATCH
        help?: CommandHelp
    }

    interface CommandVersions {
        1: Command,
        2: CommandV2
    }
}
export { }
