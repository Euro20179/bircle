let infoPerUser: {
    [key: string]: {
        tr: HTMLTableRowElement,
        nwTd: HTMLTableCellElement,
        percentTd: HTMLTableCellElement,
        nw: number
    }
} = {}


fetch("/api/economy").then(res => {
    res.json().then(economyJson => {
        const lb = document.querySelector("#leaderboard tbody")
        if (!lb) return
        let economyTotalNw = 0
        for (let user in economyJson) {
            const userData = economyJson[user]

            let netWorth = userData.money
            let stocks = userData.stocks
            if (stocks) {
                for (let stock in userData.stocks) {
                    netWorth += stocks[stock].buyPrice * stocks[stock].shares
                }
            }

            if (userData.loanUsed) {
                netWorth -= userData.loanUsed
            }

            economyTotalNw += netWorth

            let tr = document.createElement("tr")

            let idTd = document.createElement("td")
            idTd.append(user)

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

enum TableSort {
    None,
    NetWorth,
    Percent
}

let tableIsSortedBy: TableSort = TableSort.None

const nwCol = document.getElementById("net-worth-col")
const percentCol = document.getElementById("percent-col")

nwCol?.addEventListener("click", e => {
    tableIsSortedBy = TableSort.NetWorth
})
