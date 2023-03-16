const searchBox = document.getElementById("search-box")

const resultDisplay = document.getElementById("result-display")

let page = document.querySelector("main")

fetch(`/api/command-search`).then(res => {
    res.text().then(html => {
        page.insertAdjacentHTML("beforeend", html)
        let resultCount = document.querySelectorAll(".command-section").length

        resultDisplay.setAttribute("data-result-count", String(resultCount))

        resultDisplay.innerText = String(resultCount)

    })
})

document.addEventListener("keydown", e => {
    if (document.activeElement === searchBox) return
    if (e.key === 'j') {
        scrollBy(0, 100)
    }
    else if (e.key === 'k') {
        scrollBy(0, -100)
    }
    else if (e.key === 'g') {
        scroll(0, 0)
    }
    else if (e.key === 'G' && e.shiftKey) {
        scroll(0, page.scrollHeight)
    }
    else if (e.key === 'u' && e.ctrlKey) {
        scrollBy(0, -(innerHeight / 2))
        e.preventDefault()
    }
    else if (e.key === 'd' && e.ctrlKey) {
        scrollBy(0, (innerHeight / 2))
        e.preventDefault()
    }
    else if (e.key === '|') {
        searchBox.focus()
        searchBox.value = "[help.accepts_stdin]"
        e.preventDefault()
    }
    else if (e.key === "[") {
        searchBox.focus()
        searchBox.value = '[]'
        searchBox.setSelectionRange(1, 1)
        e.preventDefault()
    }
    else if (e.key === '/') {
        searchBox.focus()
        searchBox.value = ""
        e.preventDefault()
    }
    else if (e.key === "@") {
        searchBox.focus()
        searchBox.value = "@"
        e.preventDefault()
    }
    else if (e.key === "?") {
        searchBox.focus()
        searchBox.value = "?"
        e.preventDefault()
    }
})

searchBox.addEventListener("keydown", e => {
    if (e.key === 'Enter') {
        page.innerHTML = ""
        let search = e.target.value
        document.activeElement.blur()
        let endPoint = `/api/command-search`
        let paramsChar = "?"
        while (search) {
            if (search.startsWith("@")) {
                let spaceIdx = search.indexOf(" ")
                if (spaceIdx === -1) {
                    endPoint += `${paramsChar}category=${encodeURI(search.slice(1))}`
                    search = ""
                }
                else {
                    endPoint += `${paramsChar}category=${encodeURI(search.slice(1, spaceIdx))}`
                    search = search.slice(spaceIdx + 1)
                }
            }
            else if (search.startsWith("?")) {
                let spaceIdx = search.indexOf(" ")
                if (spaceIdx === -1) {
                    endPoint += `${paramsChar}cmd=${encodeURI(search.slice(1))}`
                    search = ""
                }
                else {
                    endPoint += `${paramsChar}cmd=${encodeURI(search.slice(1, spaceIdx))}`
                    search = search.slice(spaceIdx + 1)
                }
            }
            else if (search.startsWith('[') && search.indexOf("]") > -1) {
                let end = search.indexOf("]")
                endPoint += `${paramsChar}has-attr=${encodeURI(search.slice(1, end))}`
                search = search.indexOf(" ") === -1 ? "" : search.slice(search.indexOf(" ") + 1)
            }
            else if (search) {
                endPoint += `${paramsChar}search=${encodeURI(search)}`
                search = ""
            }
            paramsChar = "&"
        }
        console.log(endPoint)
        fetch(endPoint).then(res => {
            res.text().then(html => {
                page.insertAdjacentHTML("beforeend", html)
                let resultCount = document.querySelectorAll(".command-section").length

                resultDisplay.setAttribute("data-result-count", String(resultCount))

                resultDisplay.innerText = String(resultCount)
            })
        })
    }
})
