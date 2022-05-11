import {MessageEmbed, Message, MessageMentionOptions} from "discord.js"

declare global{
    type ArgumentList = Array<string>

    type Opts = {[k: string]: string | boolean}

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
	allowedMentions?: MessageMentionOptions
    }

    interface CommandHelp{
	info?: string,
	/**
	 * @deprecated Use /ccmd <alias name> <command> <text> instead, ie: no built in aliases
	 */
	aliases?: string[],
	arguments?: {
	    [key: string]: {
		description: string,
		required?: boolean,
		requires?: string
	    }
	},
	options?: {
	    [key: string]: {
		description: string
	    }
	}
    }

    interface Command{
	run: (msg: Message, args: ArgumentList) => Promise<CommandReturn>;
	permCheck?: (msg: Message) => boolean;
	help?: CommandHelp
    }
}
