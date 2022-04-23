const { REST } = require("@discordjs/rest")
const { Routes } = require("discord-api-types/v9")

const { Client, Intents } = require("discord.js")

const fs = require("fs")


const client = new Client({intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES]})

const token = fs.readFileSync("./TOKEN", "utf-8")

const CLIENT_ID = "788871088674177034"
const GUILD_ID = "427567510611820544"

const commands = [
    {
        name: "attack",
        description: "attacks chris, and no one else",
        options: [
            {
                type: 3,
                name: "user",
                description: "who to attack"
            }
        ]
    },
    {
        name: "ping",
        description: "Pings a user for some time",
        options: [
            {
                type: 3,
                name: "user",
                description: "who to ping twice"
            },
            {
                type: 4,
                name: "evilness",
                description: "on a scale of 1 to 10 how evil are you"
            }
        ]
    }
]

const rest = new REST({version: "9"}).setToken(token);

(async () => {
    try {
      console.log('Started refreshing application (/) commands.');
  
      await rest.put(
        Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
        { body: commands },
      );
  
      console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
      console.error(error);
    }
})();

client.on('ready', () => {
    console.log("ONLINE")
})

client.on("messageCreate", async(m) => {
})

client.on("interactionCreate", async(interaction) => {
    if(!interaction.isCommand()) return;

    if(interaction.commandName == 'attack'){
        let user = interaction.options.get("user")['value']
        await interaction.reply(`Attacking ${user}...`)
        await interaction.channel.send(`${user} has been attacked by <@${interaction.user.id}>`)
    }
    else if(interaction.commandName == 'ping'){
        let user = interaction.options.get("user")?.value || `<@${interaction.user.id}>`
        let times = interaction.options.get("amount")?.value || 1
        interaction.reply("Pinging...")
        for(let i = 0; i < times; i++){
            await interaction.channel.send(`${user} has been pinged`)
        }
    }
})

client.login(token)