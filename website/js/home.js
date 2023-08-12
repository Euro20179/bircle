
const command = document.getElementById("command")
const runButton = document.getElementById("run-button")
const submitInput = document.getElementById("submit-input")

const commandOutput = document.getElementById("command-output")

let urlParams = new URLSearchParams(window.location.href.slice(window.location.href.indexOf("?")))

let codeToken = ""

let converter = new showdown.Converter()

if (urlParams.get("code")) {
    codeToken = urlParams.get("code")
    fetch(`http://${window.location.host}/discord-sign-in?code-token=${codeToken}&host=${window.location.host}`, {
        method: "POST",

    }).then(console.log)
}

/**
    * @param text {string}
*/
function markdownToHTML(text) {
    return converter.makeHtml(text)
}

class Embed {
    constructor({ title, description, fields, color, url, thumbnail, footer, image }) {
        this.title = title
        this.description = description
        this.fields = fields
        this.color = color
        this.url = url
        this.thumbnail = thumbnail
        this.footer = footer
        this.image = image
    }

    render() {
        let embedBox = document.createElement("div")
        embedBox.classList.add('embed')

        let headerArea = document.createElement("div")
        headerArea.classList.add("embed-header")

        if (this.title) {
            let titleText = document.createElement("p")
            titleText.classList.add('embed-title')
            if (this.url) {
                let titleA = document.createElement("a")
                titleA.classList.add("embed-title-link")
                titleA.append(this.title)
                titleA.href = this.url
                titleText.append(titleA)
            }
            else {
                titleText.append(this.title)
            }
            headerArea.append(titleText)
        }

        if (this.thumbnail) {
            let img = document.createElement("img")
            img.src = this.thumbnail.url
            img.classList.add("embed-thumbnail")
            headerArea.append(img)
        }



        embedBox.append(headerArea)

        if (this.color) {
            let color = this.color.toString(16)
            if (color.length < 6) {
                color = "0".repeat(6 - color.length) + color
            }
            console.log(color)
            embedBox.style.borderColor = `#${color}`
        }

        if (this.description) {
            let description = document.createElement("p")
            description.classList.add('embed-description')
            description.innerHTML = converter.makeHtml(this.description)
            embedBox.append(description)

        }
        let hr = document.createElement("hr")
        embedBox.append(hr)

        if (this.fields?.length) {
            for (let field of this.fields) {
                let fieldBox = document.createElement("div")
                fieldBox.classList.add("embed-fieldbox")

                if (field.inline !== true) {
                    fieldBox.classList.add("full-grid-column")
                }

                let f = document.createElement("div")
                f.classList.add("embed-field")

                let name = document.createElement("p")
                name.classList.add("embed-field-name")
                name.innerHTML = converter.makeHtml(field.name)
                f.append(name)

                let value = document.createElement("p")
                value.classList.add("embed-field-value")
                value.innerHTML = converter.makeHtml(field.value)
                f.append(value)
                fieldBox.append(f)
                embedBox.append(fieldBox)
            }
        }

        if(this.image){
            let image = document.createElement("img")
            image.src = this.image.url
            image.classList.add("embed-image")
            embedBox.append(image)
        }

        if(this.footer){
            let hr = document.createElement("hr")
            embedBox.append(hr)
            let footer = document.createElement("div")
            footer.classList.add("embed-footer")

            let footerP = document.createElement("p")
            if(this.footer.icon_url){
                let img = document.createElement("img")
                img.src = this.footer.icon_url
                let aspectRatio = img.width / img.height
                //make the image smaller and keep aspect ratio, hard to do in css only without knowing the iamge size
                img.width = 30
                img.height = img.width / aspectRatio
                img.classList.add("embed-footer-icon")
                footer.append(img)
            }
            footerP.classList.add("embed-footer-text")
            footerP.innerHTML = converter.makeHtml(this.footer.text)
            footer.append(footerP)
            embedBox.append(footer)
        }

        commandOutput.append(embedBox)
    }
}

function removeOutputChildren() {

    while (commandOutput.firstChild) {
        commandOutput.removeChild(commandOutput.firstChild)
    }
}

function handleSending(rv, removeChildren = true) {
    if (rv.noSend) return
    if (removeChildren) {
        removeOutputChildren()
    }

    if (rv.noSend) {
        return;
    }

    if (rv.content) {
        let outputP = document.createElement("p")
        rv.content = rv.content.replaceAll("\n", "<br>")
        outputP.classList.add("output-content")
        outputP.innerHTML = rv.mimetype === "text/html" ? rv.content : markdownToHTML(rv.content)
        commandOutput.append(outputP)
    }

    if (rv.delete) {
        command.value = ""
    }

    if (rv.embeds?.length) {
        for (let embed of rv.embeds) {
            let e = new Embed(embed)
            e.render()
        }
    }
}

submitInput.addEventListener("click", async (e) => {
    //get the text the user typed
    let text = commandOutput.innerHTML.split("<hr>")[0].match(/type response here:(.*)<br>$/)[1]
    //hide this button again
    submitInput.classList.add("hidden")
    //send back to server
    ws.send(JSON.stringify({ "prompt-response": text }))
    //we say this because the server will not continue until the timeout is over
    alert("Your input has sent, this may take a while")
})

let ws;
runButton.addEventListener("click", async (e) => {
    let cmd = command.value
    if (!cmd)
        return

    let url = `/run?code-token=${codeToken}`

    let channelId = cmd.match(/^channel:\s*(\d+)$/m)

    if (channelId) {
        cmd = cmd.split("\n").slice(1).join("\n")
        url += `&channel-id=${channelId[1]}`
    }

    //tell the interpreter that it's being run from web
    cmd = `W:${cmd}`

    ws = new WebSocket(`ws://${window.location.host}/run?code-token=${codeToken}`)

    ws.addEventListener("open", function(e) {
        removeOutputChildren()

        this.addEventListener("message", e => {
            let result = JSON.parse(e.data)
            if (result.error) {
                handleSending({ content: result.error, status: 2 })
            }
            //if the server is ready for inputs, add the type response here text, and show the submit input button
            else if (result.event === 'prompt-user') {
                if (commandOutput.innerHTML) {
                    commandOutput.innerHTML = `type response here: <br><hr><br>${commandOutput.innerHTML}`
                }
                else {
                    commandOutput.innerHTML = `type response here: <br><hr>`
                }
                submitInput.classList.remove("hidden")
            }
            else if (result.event === "append-data") {
                commandOutput.setAttribute("data-status-code", String(result.rv.status))
                handleSending(result.rv, false)
            }
            else if (result.rv !== undefined) {
                commandOutput.setAttribute("data-status-code", String(result.rv.status))
                handleSending(result.rv)
            }
            else if (result.status !== undefined) {
                commandOutput.setAttribute("data-status-code", String(result.status))
                handleSending(result)
            }
        })
        this.send(JSON.stringify({ event: "run", data: cmd }))
    })

    // let res = await fetch(`/run?code-token=${codeToken}`, { method: "POST", body: cmd })
    // let data = await res.json()
    // commandOutput.setAttribute("data-status-code", String(data.rv.status))
    // handleSending(data.rv)
})
