
const channelId = document.getElementById("channel-id")
const command = document.getElementById("command")
const runButton = document.getElementById("run-button")

const commandOutput = document.getElementById("command-output")

class Embed {
    constructor({title, description, fields, color}) {
        this.title = title
        this.description = description
        this.fields = fields
        this.color = color
    }

    render() {
        let embedBox = document.createElement("div")
        embedBox.classList.add('embed')

        if (this.title) {
            let titleText = document.createElement("p")
            titleText.classList.add('embed-title')
            titleText.append(this.title)
            embedBox.append(titleText)
        }
        if(this.color){
            let color = this.color.toString(16)
            if(color.length < 6){
                color = "0".repeat(6 - color.length) + color
            }
            console.log(color)
            embedBox.style.borderColor = `#${color}`
        }

        if (this.description) {
            let description = document.createElement("p")
            description.classList.add('embed-description')
            description.append(this.description)
            embedBox.append(description)

            let hr = document.createElement("hr")
            embedBox.append(hr)
        }

        if (this.fields?.length) {
            for (let field of this.fields) {
                let fieldBox = document.createElement("div")
                fieldBox.classList.add("embed-fieldbox")

                if(field.inline !== true){
                    fieldBox.classList.add("full-grid-column")
                }

                let f = document.createElement("div")
                f.classList.add("embed-field")

                let name = document.createElement("p")
                name.classList.add("embed-field-name")
                name.append(field.name)
                f.append(name)

                let value = document.createElement("p")
                value.classList.add("embed-field-value")
                value.append(field.value)
                f.append(value)
                fieldBox.append(f)
                embedBox.append(fieldBox)
            }
        }

        commandOutput.append(embedBox)
    }
}

function handleSending(rv) {
    while (commandOutput.firstChild) {
        commandOutput.removeChild(commandOutput.firstChild)
    }

    if(rv.noSend){
        return;
    }

    if (rv.content) {
        let outputP = document.createElement("p")
        outputP.classList.add("output-content")
        outputP.append(rv.content)
        commandOutput.append(outputP)
    }

    if (rv.embeds?.length) {
        for (let embed of rv.embeds) {
            let e = new Embed(embed)
            e.render()
        }
    }
}

runButton.addEventListener("click", async (e) => {
    let cmd = command.value
    if (!cmd)
        return
    let cid = channelId.value

    let res = await fetch(`/run?channel-id=${cid}`, { method: "POST", body: cmd })
    let data = await res.json()
    handleSending(data.rv)
})
