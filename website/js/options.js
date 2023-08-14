let inputs = [...document.querySelectorAll("input")].concat([...document.querySelectorAll("textarea")])

const savedHeader = document.getElementById("saved-popup")

let saves = {}
for(let input of inputs){
    let to
    let lastInput = Date.now()
    saves[input.id] = true
    input.addEventListener("input", e => {
        saves[input.id] = false
        const toFn = () => {
            let value = e.target.type === 'checkbox' ? e.target.checked : e.target.value
            if(!document.cookie){
                alert("Could not save")
            }
            else fetch(`${window.location.protocol}//${window.location.host}/set-option/${e.target.id}?code=${document.cookie}`, {
                method: "POST",
                body: value
            }).then(() => {
                saves[input.id] = true
            })
            savedHeader.setAttribute("data-saved", "true")
            setTimeout(() => {
                savedHeader.removeAttribute("data-saved")
            }, 3000)
            to = null
        }
        let secondsPassed = (Date.now() - lastInput) / 1000
        if(!to) to = setTimeout(toFn, 2000)
        if(secondsPassed < 2){
            clearTimeout(to)
            to = setTimeout(toFn, 2000)
        }
    })
}

addEventListener("beforeunload", function(e) {
    for(let save of Object.values(saves)){
        if(!save){
            e.preventDefault()
            e.returnValue = `It looks like there are unsaved changes are you sure you want to leave?`
        }
    }
})
