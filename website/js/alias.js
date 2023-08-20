function generateAlias() {
    let commandToRun = `[n:alias`

    if (!appendArgsBox.checked) {
        commandToRun += ` -no-args`
    }
    if (!appendOptsBox.checked) {
        commandToRun += ` -no-opts`
    }
    if (!standardizeOptsBox.checked) {
        commandToRun += ` -no-standardize`
    }

    commandToRun += ` -no-easy name ${command.value}`


    if (help.value) {
        commandToRun += `\nhelp-info ${help.value}`
    }

    if (tagsInput.value) {
        commandToRun += `\ntags ${tagsInput.value}`
    }

    for (let tag of tags) {
        commandToRun += tag.genText()
    }

    for (let arg of argFields) {
        commandToRun += arg.genText()
    }

    for (let opt of optFields) {
        commandToRun += opt.genText()
    }

    if (!cmdToRunEntry.value) {
        return
    }
    else {
        commandToRun += `\ncommand ${cmdToRunEntry.value}`
    }

    let pre = document.getElementById("output")

    while (pre.firstChild) {
        pre.removeChild(pre.firstChild)
    }

    pre.append(commandToRun)

}

const form = document.getElementById("cmd-form")

let [command, help, tagsInput, addTagButton, addArgButton, addOptButton, appendArgsBox, appendOptsBox, standardizeOptsBox, generate] = form.getElementsByTagName("input")

let cmdToRunEntry = document.getElementById("cmd-to-run")

form.addEventListener("input", e => {
    generateAlias()
})

console.log(addArgButton)

let argFields = []
let optFields = []

let tags = []

class TagInputFields {
    constructor(tagNo) {

        this.tagNo = tagNo

        this.tagInput = document.createElement("input")
        this.tagInput.placeholder = "Tag name"
        this.tagInput.required = true

        this.removeButton = document.createElement("input")
        this.removeButton.type = 'button'
        this.removeButton.value = "-"

        this.removeButton.addEventListener("click", (e => {
            this.removeFromDocument()
        }).bind(this))

        this.br = document.createElement("br")

        addTagButton.parentNode.insertBefore(this.tagInput, addTagButton)
        this.nameInput.focus()
        addTagButton.parentNode.insertBefore(this.removeButton, addTagButton)
        addTagButton.parentNode.insertBefore(this.br, addTagButton)
    }
    removeFromDocument() {
        this.tagInput.remove()
        this.removeButton.remove()
        this.br.remove()

        tags = tags.filter(v => v.tagNo !== this.tagNo)
    }
    genText() {
        let text = `\ntag ${this.tagInput.value}`
        return text
    }
}

class ArgumentInputFields {
    constructor(argNo) {
        this.argNo = argNo

        this.nameInput = document.createElement("input")
        this.nameInput.placeholder = "Argument name"
        this.nameInput.required = true

        this.descriptionInput = document.createElement("input")
        this.descriptionInput.placeholder = "Argument description"
        this.descriptionInput.required = true

        this.requiredInput = document.createElement("input")
        this.requiredInput.placeholder = "Argument is required (true/false)"

        this.defaultInput = document.createElement("input")
        this.defaultInput.placeholder = "Argument default"

        this.removeButton = document.createElement("input")
        this.removeButton.type = 'button'
        this.removeButton.value = "-"

        this.removeButton.addEventListener("click", (e => {
            this.removeFromDocument()
        }).bind(this))

        this.br = document.createElement("br")

        addArgButton.parentNode.insertBefore(this.nameInput, addArgButton)
        this.nameInput.focus()
        addArgButton.parentNode.insertBefore(this.descriptionInput, addArgButton)
        addArgButton.parentNode.insertBefore(this.requiredInput, addArgButton)
        addArgButton.parentNode.insertBefore(this.defaultInput, addArgButton)
        addArgButton.parentNode.insertBefore(this.removeButton, addArgButton)
        addArgButton.parentNode.insertBefore(this.br, addArgButton)
    }
    removeFromDocument() {
        this.nameInput.remove()
        this.descriptionInput.remove()
        this.requiredInput.remove()
        this.defaultInput.remove()
        this.removeButton.remove()
        this.br.remove()

        argFields = argFields.filter(v => v.argNo !== this.argNo)
    }
    genText() {
        let text = `\narg ${this.nameInput.value} | desc | ${this.descriptionInput.value}`
        if (this.requiredInput.value) {
            text += `\narg ${this.nameInput.value} | required | ${this.requiredInput.value}`
        }
        if (this.defaultInput.value) {
            text += `\narg ${this.nameInput.value} | default | ${this.defaultInput.value}`
        }
        return text
    }
}

class OptionInputFields {
    constructor(argNo) {
        this.argNo = argNo

        this.nameInput = document.createElement("input")
        this.nameInput.placeholder = "Option name"
        this.nameInput.required = true

        this.descriptionInput = document.createElement("input")
        this.descriptionInput.placeholder = "Option description"
        this.descriptionInput.required = true

        this.altInput = document.createElement("input")
        this.altInput.placeholder = "Alternate opts (seperated by ,)"

        this.defaultInput = document.createElement("input")
        this.defaultInput.placeholder = "Opt default"

        this.removeButton = document.createElement("input")
        this.removeButton.type = 'button'
        this.removeButton.value = "-"

        this.removeButton.addEventListener("click", (e => {
            this.removeFromDocument()
        }).bind(this))

        this.br = document.createElement("br")

        addOptButton.parentNode.insertBefore(this.nameInput, addOptButton)
        this.nameInput.focus()
        addOptButton.parentNode.insertBefore(this.descriptionInput, addOptButton)
        addOptButton.parentNode.insertBefore(this.altInput, addOptButton)
        addOptButton.parentNode.insertBefore(this.defaultInput, addOptButton)
        addOptButton.parentNode.insertBefore(this.removeButton, addOptButton)
        addOptButton.parentNode.insertBefore(this.br, addOptButton)
    }

    genText() {
        let text = `\nopt ${this.nameInput.value} | desc | ${this.descriptionInput.value}`
        if (this.altInput.value) {
            text += `\nopt ${this.nameInput.value} | alt | ${this.altInput.value}`
        }
        if (this.defaultInput.value) {
            text += `\nopt ${this.nameInput.value} | default | ${this.defaultInput.value}`
        }
        return text
    }

    removeFromDocument() {
        this.nameInput.remove()
        this.descriptionInput.remove()
        this.altInput.remove()
        this.defaultInput.remove()
        this.removeButton.remove()
        this.br.remove()

        optFields = optFields.filter(v => v.argNo !== this.argNo)
    }
}

addArgButton.addEventListener("click", e => {
    argFields.push(new ArgumentInputFields(argFields.length))
})

addOptButton.addEventListener("click", e => {
    optFields.push(new OptionInputFields(optFields.length))
})

addTagButton.addEventListener("click", e => {
    tags.push(new TagInputFields(tags.length))
})



generate.addEventListener("click", e => {
    generateAlias()
})

