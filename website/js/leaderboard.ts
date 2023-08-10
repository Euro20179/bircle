const urlParams = new URLSearchParams(location.href.split("?").slice(1).join("?"))

type SortType = "user" | "percentage" | "net-worth" | "none"

let infoPerUser: {
    [key: string]: {
        tr: HTMLTableRowElement,
        nwTd: HTMLTableCellElement,
        percentTd: HTMLTableCellElement,
        nw: number
    }
} = {}


function playerLooseNetWorth(ECONOMY: { [key: string]: any }, id: string) {
    if (!ECONOMY[id])
        return 0
    return playerEconomyLooseTotal(ECONOMY, id) - (ECONOMY[id]?.loanUsed || 0)
}

function playerEconomyLooseTotal(ECONOMY: { [key: string]: any }, id: string) {
    if (ECONOMY[id] === undefined)
        return 0
    let money = ECONOMY[id]?.money
    let stocks = ECONOMY[id].stocks
    if (stocks) {
        for (let stock in ECONOMY[id].stocks) {
            money += stocks[stock].buyPrice * stocks[stock].shares
        }
    }
    return money
}

fetch("/api/economy").then(res => {
    res.json().then(economyJson => {
        let sort: SortType = urlParams.get("sort") as SortType
        let economyTotalNw = 0
        let netWorths: { [key: string]: number } = {}
        for (let user in economyJson) {
            netWorths[user] = playerLooseNetWorth(economyJson, user)
            economyTotalNw += netWorths[user]
        }
        switch (sort) {
            case "user":
                economyJson = Object.fromEntries(Object.entries(economyJson).sort((a, b) => a[0] > b[0] ? 1 : -1))
                break
            case "none": break
            case "net-worth":
                economyJson = Object.fromEntries(Object.entries(economyJson).sort((a, b) => netWorths[b[0]] - netWorths[a[0]]))
                break
            case "percentage":
                economyJson = Object.fromEntries(Object.entries(economyJson).sort((a, b) => (netWorths[b[0]] / economyTotalNw) - (netWorths[a[0]] / economyTotalNw)))
                break
        }
        const lb = document.querySelector("#leaderboard tbody")
        if (!lb) return
        fetch(`/api/resolve-ids?ids=${Object.keys(economyJson).join(",")}`)
            .then(usersResp => usersResp.json())
            .then(usersJson => {
                for (let user in economyJson) {
                    console.table(user, usersJson[user])
                    const userName = usersJson[user].username

                    let netWorth = playerLooseNetWorth(economyJson, user)

                    economyTotalNw += netWorth

                    let tr = document.createElement("tr")

                    let idTd = document.createElement("td")
                    idTd.append(userName)

                    let nwTd = document.createElement("td")
                    nwTd.append(String(netWorth))

                    let percent = document.createElement("td")

                    infoPerUser[user] = {
                        tr: tr,
                        percentTd: percent,
                        nwTd: nwTd,
                        nw: netWorth
                    }

                    tr.append(idTd)
                    tr.append(nwTd)
                    tr.append(percent)

                    lb.append(tr)
                }
                for (let user in infoPerUser) {
                    infoPerUser[user].percentTd.append(String(infoPerUser[user].nw / economyTotalNw * 100) + "%")
                }
            })
    })
})

function sortTable(by: SortType) {
    //@ts-ignore
    window.location = `${window.location.protocol}//${window.location.host}/leaderboard?sort=${by}`
}
