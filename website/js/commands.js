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
        if (search.startsWith("@")) {
            fetch(`/api/command-search?category=${encodeURI(search.slice(1))}`).then(res => {
                res.text().then(html => {
                    page.insertAdjacentHTML("beforeend", html)
                    let resultCount = document.querySelectorAll(".command-section").length

                    resultDisplay.setAttribute("data-result-count", String(resultCount))

                    resultDisplay.innerText = String(resultCount)
                })
            })
        }
        else if (search.startsWith("?")) {
            fetch(`/api/command-search?cmd=${encodeURI(search.slice(1))}`).then(res => {
                res.text().then(html => {
                    page.insertAdjacentHTML("beforeend", html)
                    let resultCount = document.querySelectorAll(".command-section").length

                    resultDisplay.setAttribute("data-result-count", String(resultCount))

                    resultDisplay.innerText = String(resultCount)
                })
            })
        }
        else fetch(`api/command-search/${encodeURI(search)}`).then(res => {
            res.text().then(html => {
                page.insertAdjacentHTML("beforeend", html)
                let resultCount = document.querySelectorAll(".command-section").length

                resultDisplay.setAttribute("data-result-count", String(resultCount))

                resultDisplay.innerText = String(resultCount)
            })
        })
    }
})
