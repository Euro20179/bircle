import { MessageEmbed, Message, MessageMentionOptions, MessageOptions, MessagePayload } from "discord.js"

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
        dm?: boolean,
        recurse?: boolean | { categories?: CommandCategory[], commands?: string[] },
        do_change_cmd_user_expansion?: boolean
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

    interface Command {
        run: (msg: Message, args: ArgumentList, sendCallback: (data: MessageOptions | MessagePayload | string) => Promise<Message>, opts: Opts, deopedArgs: ArgumentList, recursion_count: number, command_bans?: { categories?: CommandCategory[], commands?: string[] }) => Promise<CommandReturn>;
        permCheck?: (msg: Message) => boolean;
        help?: CommandHelp
        category: CommandCategory,
        cmd_std_version?: 1
    }

    interface CommandV2RunArg { msg: Message<boolean>, rawArgs: ArgumentList, sendCallback: (data: MessageOptions | MessagePayload | string) => Promise<Message>, opts: Options, args: ArgumentList, recursionCount: number, commandBans?: { categories?: CommandCategory[], commands?: string[] } }

    type CommandV2Run = ({msg, rawArgs, sendCallback, opts, args, recursionCount, commandBans}: CommandV2RunArg) => Promise<CommandReturn>;

    interface CommandV2 {
        run: CommandV2Run
        permCheck?: (msg: Message) => boolean;
        help?: CommandHelp
        category: CommandCategory,
        cmd_std_version?: 2
    }

    interface CommandVersions {
        1: Command,
        2: CommandV2
    }
}
export { }
