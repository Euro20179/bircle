const {MessageEmbed} = require("discord.js")

type ArgumentList = Array<string>

interface CommandFile{
    attachment: string,
    name?: string,
    description?: string,
    delete?: boolean
}

type FileArray = Array<CommandFile>

interface CommandReturn {
    content?: string,
    embeds?: Array<typeof MessageEmbed>
    files?: FileArray,
    deleteFiles?: boolean
    delete?: boolean
}
