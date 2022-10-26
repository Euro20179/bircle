import {MessageEmbed, Message, MessageMentionOptions, MessageOptions, MessagePayload} from "discord.js"

declare global{
    type ArgumentList = Array<string>

    type Opts = {[k: string]: string | boolean}

    type CommandCategory = typeof CommandCategory

    interface CommandFile{
	attachment: string,
	name?: string,
	description?: string,
	delete?: boolean
    }

    type FileArray = Array<CommandFile>

    interface CommandReturn {
	content?: string,
	embeds?: Array<MessageEmbed>
	files?: FileArray,
	deleteFiles?: boolean
	delete?: boolean
	noSend?: boolean,
	allowedMentions?: MessageMentionOptions,
    dm?: boolean,
    recurse?: boolean | {categories?: CommandCategory[], commands?: string[]},
    }

    interface CommandHelpArguments{
        [key: string]: {
            description: string,
            required?: boolean,
            requires?: string
        }
    }
    interface CommandHelpOptions{
        [key: string]: {
            description: string,
            alternates?: string[]
        }
    }

    interface CommandHelp{
        info?: string,
        /**
         * @deprecated Use /ccmd <alias name> <command> <text> instead, ie: no built in aliases
         */
        aliases?: string[],
        arguments?: CommandHelpArguments,
        options?: CommandHelpOptions,
        tags?: string[]
    }

    interface ValidationReturn extends CommandReturn{
        invalid: string
    }

    interface Command{
        run: (msg: Message, args: ArgumentList, sendCallback: (data: MessageOptions | MessagePayload | string) => Promise<Message>, opts: Opts, deopedArgs: ArguentList) => Promise<CommandReturn>;
        permCheck?: (msg: Message) => boolean;
        help?: CommandHelp
        category: CommandCategory,
    }
}
